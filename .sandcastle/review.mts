import { execFileSync } from "node:child_process";
import { runReview } from "./review-lib.mts";

// Run RALPH's self-review pass against ANY existing open PR, not just ones
// main.mts itself opened. Also checks for pending human review comments
// left since the last pass and addresses those, not just the diff.
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

await runReview({ prNumber, issueNumber, branch });
