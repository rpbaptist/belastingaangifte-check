import { run, claudeCode, Output } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { z } from "zod";

// Run RALPH's self-review pass against ANY existing open PR, not just ones
// main.mts itself opened.
//
//   PR_NUMBER=112 npx tsx .sandcastle/review.mts
//
// Note: this checks out the PR's branch into a Sandcastle-managed worktree.
// Git only allows one worktree per branch — if that branch already has an
// active worktree elsewhere (e.g. one of the manual .claude/worktrees/*
// checkouts), this will fail. Remove/close that worktree first if so.

const prNumber = process.env.PR_NUMBER;
if (!prNumber) {
  throw new Error("PR_NUMBER is required");
}

const prInfo = JSON.parse(
  execFileSync("gh", ["pr", "view", prNumber, "--json", "headRefName,body"], {
    encoding: "utf-8",
  }),
) as { headRefName: string; body: string };

const branch = prInfo.headRefName;
const issueMatch = prInfo.body.match(/(?:closes|fixes|resolves)\s+#(\d+)/i);
const issueNumber = issueMatch?.[1] ?? "unknown";

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
  branchStrategy: { type: "branch", branch },
  promptFile: "./.sandcastle/prompt-review.md",
  promptArgs: { ISSUE_NUMBER: issueNumber, PR_NUMBER: prNumber, PR_DIFF: diff },
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
  execFileSync("git", ["push", "origin", branch], { stdio: "inherit" });
  console.log(
    `Review pass pushed ${reviewResult.commits.length} more commit(s).`,
  );
}

const { summary, comments, newIssues } = reviewResult.output;
const commentBody = [summary, "", ...comments.map((c) => `- ${c}`)].join(
  "\n",
);
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
  `Done: PR #${prNumber} reviewed (${newIssues.length} follow-up issue(s)).`,
);
