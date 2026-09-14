import { run, claudeCode, Output } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { z } from "zod";

// Invoked per-issue by loop.sh:
//   ISSUE_NUMBER=42 ISSUE_TITLE="..." ISSUE_BODY="..." npx tsx .sandcastle/main.mts
//
// Runs Claude Code inside a sandboxed container on a dedicated branch. Push
// and PR creation happen HERE, on the host, after the sandbox exits — never
// inside the container — so no GitHub write credential is ever reachable
// from inside the sandbox. See
// ~/teaching/ralph-loop/learning-records/0003-sandcastle-replaces-manual-worktree-sandbox.md

const issueNumber = process.env.ISSUE_NUMBER;
if (!issueNumber) {
  throw new Error("ISSUE_NUMBER is required");
}
const issueTitle = process.env.ISSUE_TITLE ?? `issue #${issueNumber}`;

const branch = `ralph/issue-${issueNumber}`;

const result = await run({
  agent: claudeCode("claude-opus-4-8", { effort: "high" }),
  sandbox: docker({
    mounts: [
      { hostPath: "~/.npm", sandboxPath: "/home/agent/.npm", readonly: true },
    ],
  }),
  branchStrategy: { type: "branch", branch },
  promptFile: "./.sandcastle/prompt.md",
  promptArgs: {
    ISSUE_NUMBER: issueNumber,
    ISSUE_TITLE: process.env.ISSUE_TITLE ?? "",
    ISSUE_BODY: process.env.ISSUE_BODY ?? "",
  },
  hooks: {
    sandbox: {
      onSandboxReady: [
        { command: 'git config user.name "Ralph (belastingaangifte-check agent)"' },
        { command: 'git config user.email "ralph-agent@users.noreply.github.com"' },
        { command: "npm ci" },
      ],
    },
  },
  output: Output.string({ tag: "pr_description" }),
});

// Trust nothing the agent self-reports beyond what Sandcastle itself
// verified: real commits on the branch. No commits = blocked, regardless
// of what the agent's output claims.
if (result.commits.length === 0) {
  console.error(`No commits on ${result.branch}. Treating as blocked.`);
  process.exit(1);
}

let prNumber: string;
try {
  execFileSync("git", ["push", "-u", "origin", result.branch], {
    stdio: "inherit",
  });
  const prUrl = execFileSync(
    "gh",
    [
      "pr",
      "create",
      "--head",
      result.branch,
      "--title",
      issueTitle,
      "--body",
      `${result.output || "No description provided."}\n\nCloses #${issueNumber}`,
    ],
    { encoding: "utf-8" },
  ).trim();
  console.log(`PR opened: ${prUrl}`);
  prNumber = prUrl.split("/").pop()!;
} catch (err) {
  console.error(`Push or PR creation failed for ${result.branch}:`, err);
  process.exit(1);
}

// Self-review pass, per AGENTS.md: "Review the PR and leave findings as
// comments. Address small review issues directly." Runs as a second,
// separate sandbox iteration on the SAME branch/worktree (branchStrategy
// reuses an existing branch rather than erroring). The diff is fetched
// HERE on the host (broad gh session) and handed in via promptArgs, so the
// sandbox never needs gh access at all — same host-only-credential
// invariant as the build phase.
const diff = execFileSync("gh", ["pr", "diff", prNumber], {
  encoding: "utf-8",
  maxBuffer: 10 * 1024 * 1024,
});

const reviewSchema = z.object({
  summary: z.string(),
  comments: z.array(z.string()),
  newIssues: z.array(z.object({ title: z.string(), body: z.string() })),
});

const reviewResult = await run({
  agent: claudeCode("claude-opus-4-8", { effort: "high" }),
  sandbox: docker({
    mounts: [
      { hostPath: "~/.npm", sandboxPath: "/home/agent/.npm", readonly: true },
    ],
  }),
  branchStrategy: { type: "branch", branch }, // reuses the existing branch
  promptFile: "./.sandcastle/prompt-review.md",
  promptArgs: {
    ISSUE_NUMBER: issueNumber,
    PR_NUMBER: prNumber,
    PR_DIFF: diff,
  },
  hooks: {
    sandbox: {
      onSandboxReady: [
        { command: 'git config user.name "Ralph (belastingaangifte-check agent)"' },
        { command: 'git config user.email "ralph-agent@users.noreply.github.com"' },
        { command: "npm ci" },
      ],
    },
  },
  output: Output.object({
    tag: "review_result",
    schema: reviewSchema,
    maxRetries: 1,
  }),
});

if (reviewResult.commits.length > 0) {
  execFileSync("git", ["push", "origin", result.branch], { stdio: "inherit" });
  console.log(`Review pass pushed ${reviewResult.commits.length} more commit(s).`);
}

const { summary, comments, newIssues } = reviewResult.output;
const commentBody = [summary, "", ...comments.map((c) => `- ${c}`)].join("\n");
execFileSync("gh", ["pr", "comment", prNumber, "--body", commentBody], {
  stdio: "inherit",
});

for (const issue of newIssues) {
  execFileSync(
    "gh",
    [
      "issue",
      "create",
      "--title",
      issue.title,
      "--body",
      issue.body,
      "--label",
      "needs-triage",
    ],
    { stdio: "inherit" },
  );
}

console.log(
  `Success: ${result.branch}, ${result.commits.length + reviewResult.commits.length} commit(s), PR #${prNumber} reviewed (${newIssues.length} follow-up issue(s)).`,
);
process.exit(0);
