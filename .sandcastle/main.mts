import { run, Output } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { runReview } from "./review-lib.mts";
import { getBuildAgent, type BuildHarness } from "./harness.mts";
import { CheckpointTimeoutError, classifyRunError } from "./classify-run-error.mts";

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

const buildHarness = (process.env.RALPH_AGENT ?? "claude") as BuildHarness;

// Self-imposed wall-clock ceiling per build attempt, so a run can never
// silently consume unlimited budget with nothing checkpointed. On expiry
// the abort reason is a CheckpointTimeoutError carrying a sentinel line
// that loop.sh's is_checkpoint_timeout() greps for, and that
// classifyRunError() below checks for to route this distinctly from an
// arbitrary run() failure.
const DEFAULT_CHECKPOINT_TIMEOUT_MS = 90 * 60 * 1000;
const CHECKPOINT_TIMEOUT_MS = process.env.RALPH_CHECKPOINT_TIMEOUT_MS
  ? Number(process.env.RALPH_CHECKPOINT_TIMEOUT_MS)
  : DEFAULT_CHECKPOINT_TIMEOUT_MS;
if (!Number.isFinite(CHECKPOINT_TIMEOUT_MS) || CHECKPOINT_TIMEOUT_MS <= 0) {
  throw new Error(
    `RALPH_CHECKPOINT_TIMEOUT_MS must be a positive number, got "${process.env.RALPH_CHECKPOINT_TIMEOUT_MS}"`,
  );
}
const checkpointController = new AbortController();
const checkpointTimer = setTimeout(() => {
  checkpointController.abort(new CheckpointTimeoutError(CHECKPOINT_TIMEOUT_MS));
}, CHECKPOINT_TIMEOUT_MS);

let result;
try {
  result = await run({
    agent: getBuildAgent(buildHarness),
    sandbox: docker({
      mounts: [{ hostPath: "~/.npm", sandboxPath: "/home/agent/.npm", readonly: true }],
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
    signal: checkpointController.signal,
  });
} catch (err) {
  if (classifyRunError(err) === "checkpoint-timeout") {
    console.error((err as Error).message);
    process.exit(1);
  }
  throw err;
} finally {
  clearTimeout(checkpointTimer);
}

// Trust nothing the agent self-reports beyond what's actually on the
// branch. result.commits is NOT "commits ahead of master" — Sandcastle
// computes it against the worktree's HEAD at creation time, which for a
// *resumed* branch (one that already had commits from an earlier,
// interrupted run) is the branch's own prior tip, not master. So a
// session that resumes already-finished work and correctly adds nothing
// new always reports result.commits.length === 0, indistinguishable from
// an agent that did nothing. See ralph-logs/issue-105-20260914-185112.log
// for #105 getting wrongly blocked this way after finishing on an
// earlier run and never getting pushed.
//
// Check commits ahead of master directly instead.
const commitsAheadOfMaster = execFileSync(
  "git",
  ["rev-list", "--count", `master..refs/heads/${result.branch}`],
  { encoding: "utf-8" }
).trim();
if (commitsAheadOfMaster === "0") {
  console.error(`No commits on ${result.branch}. Treating as blocked.`);
  process.exit(1);
}

// Progress-note commits (see prompt.md "Resuming") exist so a restarted
// run can skip re-exploration — they are not real work and must never
// trigger a push/PR on their own. Only proceed once at least one commit
// ahead of master isn't a progress note.
const subjects = execFileSync(
  "git",
  ["log", "--format=%s", `master..refs/heads/${result.branch}`],
  { encoding: "utf-8" }
)
  .trim()
  .split("\n");
const hasRealWork = subjects.some((s) => !s.startsWith(`Progress notes: issue #${issueNumber}`));
if (!hasRealWork) {
  console.error(`Only progress notes on ${result.branch}, no real work yet. Treating as blocked.`);
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
    { encoding: "utf-8" }
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
