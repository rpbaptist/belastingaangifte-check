import { run, Output } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { runReview } from "./review-lib.mts";
import { getBuildAgent, type BuildHarness } from "./harness.mts";

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

const buildHarness = (process.env.RALPH_AGENT ??
  "claude") as BuildHarness;

const result = await run({
  agent: getBuildAgent(buildHarness),
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
        {
          command:
            'for i in 1 2 3 4 5; do rm -f .git/config.lock; git config user.name "Ralph (belastingaangifte-check agent)" && break || { ec=$?; if [ "$i" -eq 5 ]; then echo "git config user.name failed after 5 attempts (exit $ec)"; exit $ec; fi; echo "git config user.name failed (attempt $i/5, exit $ec) — retrying..."; sleep $((i*2)); }; done',
        },
        {
          command:
            'for i in 1 2 3 4 5; do rm -f .git/config.lock; git config user.email "ralph-agent@users.noreply.github.com" && break || { ec=$?; if [ "$i" -eq 5 ]; then echo "git config user.email failed after 5 attempts (exit $ec)"; exit $ec; fi; echo "git config user.email failed (attempt $i/5, exit $ec) — retrying..."; sleep $((i*2)); }; done',
        },
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
// comments. Address small review issues directly." Shared with review.mts
// — see review-lib.mts.
await runReview({ prNumber, issueNumber, branch: result.branch });

console.log(`Success: ${result.branch}, PR #${prNumber} built and reviewed.`);
process.exit(0);
