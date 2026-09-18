import { run, claudeCode, Output } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { z } from "zod";

// Shared by main.mts (build → review) and review.mts (review-only, any
// existing PR). Previously duplicated between the two — pulled out after
// the first extension (pending-comment detection) risked the copies
// drifting.

const RALPH_MARKER = "<!-- ralph-review -->";

interface PrComment {
  readonly author: { readonly login: string };
  readonly body: string;
  readonly createdAt: string;
}

const reviewSchema = z.object({
  summary: z.string(),
  comments: z.array(z.string()),
  newIssues: z.array(z.object({ title: z.string(), body: z.string() })),
});

export async function runReview(args: {
  readonly prNumber: string;
  readonly issueNumber: string;
  readonly branch: string;
}): Promise<void> {
  const { prNumber, issueNumber, branch } = args;

  const allComments = JSON.parse(
    execFileSync("gh", ["pr", "view", prNumber, "--json", "comments"], { encoding: "utf-8" })
  ).comments as PrComment[];

  // RALPH's own prior comments carry a hidden marker — can't tell them
  // apart from the human's own comments by GitHub author, since both post
  // as the same authenticated account (no separate bot identity).
  const ralphComments = allComments.filter((c) => c.body.includes(RALPH_MARKER));
  const lastRalphCommentAt = ralphComments.length
    ? ralphComments[ralphComments.length - 1]!.createdAt
    : undefined;

  const pendingComments = allComments.filter(
    (c) =>
      !c.body.includes(RALPH_MARKER) && (!lastRalphCommentAt || c.createdAt > lastRalphCommentAt)
  );

  const diff = execFileSync("gh", ["pr", "diff", prNumber], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const pendingCommentsText = pendingComments.length
    ? pendingComments.map((c) => `@${c.author.login} wrote:\n${c.body}`).join("\n\n---\n\n")
    : "(none)";

  // The agent has no gh access inside the sandbox (deliberate — see
  // main.mts), so it has no way to know what issues already exist. Without
  // this, "file a new issue" for anything out-of-scope reliably produces
  // duplicates across repeated review passes on different PRs.
  const openIssues = JSON.parse(
    execFileSync(
      "gh",
      ["issue", "list", "--state", "open", "--json", "number,title", "--limit", "200"],
      { encoding: "utf-8" }
    )
  ) as { number: number; title: string }[];
  const openIssuesText = openIssues.length
    ? openIssues.map((i) => `#${i.number}: ${i.title}`).join("\n")
    : "(none)";

  const reviewResult = await run({
    agent: claudeCode("claude-sonnet-5"),
    sandbox: docker({
      mounts: [{ hostPath: "~/.npm", sandboxPath: "/home/agent/.npm", readonly: true }],
    }),
    branchStrategy: { type: "branch", branch },
    promptFile: "./.sandcastle/prompt-review.md",
    promptArgs: {
      ISSUE_NUMBER: issueNumber,
      PR_NUMBER: prNumber,
      PR_DIFF: diff,
      PENDING_COMMENTS: pendingCommentsText,
      OPEN_ISSUES: openIssuesText,
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
    execFileSync("git", ["push", "origin", branch], { stdio: "inherit" });
    console.log(`Review pass pushed ${reviewResult.commits.length} more commit(s).`);
  }

  await autoFixFormatting(branch);

  const { summary, comments, newIssues } = reviewResult.output;
  // AGENTS.md: only comment on findings that may require action. A clean
  // pass (no comments) gets no PR comment at all — posting the summary
  // unconditionally turned every review into a "looks good" comment,
  // exactly the noise AGENTS.md and the review prompt tell the agent not
  // to produce.
  if (comments.length > 0) {
    const commentBody = [RALPH_MARKER, summary, "", ...comments.map((c) => `- ${c}`)].join("\n");
    execFileSync("gh", ["pr", "comment", prNumber, "--body", commentBody], {
      stdio: "inherit",
    });
  }

  for (const issue of newIssues) {
    execFileSync(
      "gh",
      ["issue", "create", "--title", issue.title, "--body", issue.body, "--label", "needs-triage"],
      { stdio: "inherit" }
    );
  }

  console.log(
    `Done: PR #${prNumber} reviewed (${pendingComments.length} pending comment(s) addressed, ${newIssues.length} follow-up issue(s)).`
  );

  // No pending comment means review found nothing outstanding: any
  // findings were either fixed inline (reviewResult.commits above) or
  // deferred to a new issue (newIssues above). Per AGENTS.md, a comment
  // only exists for something that still needs action — so its absence is
  // exactly the merge gate. A pending comment means human/agent
  // follow-up is expected first, so leave the PR open.
  if (comments.length === 0) {
    await mergeAndCleanUp(prNumber, branch);
  }
}

// `ci`'s format/lint checks fail on drift the build/review agents don't run
// themselves (e.g. an edit to a file prettier or eslint's --fix disagrees
// with). Rather than leave every such PR for a human — the CI failure gives
// no other reason to stop — fix it deterministically on the host and push,
// same as a review commit. Runs after every review pass, merge-bound or
// not, so a PR is never left open over a purely mechanical, auto-fixable
// issue. Lint runs first: eslint.config defers all formatting rules to
// prettier (eslint-config-prettier), so a --fix can't produce output
// prettier would then reformat out from under it.
async function autoFixFormatting(branch: string): Promise<void> {
  // --fix still exits non-zero when unfixable errors remain — that's not a
  // failure of this step, just something for the (unchanged) CI lint check
  // to catch and a human/agent to fix for real.
  try {
    execFileSync("npx", ["eslint", ".", "--fix"], { stdio: "inherit" });
  } catch {
    // Unfixable lint errors remain — leave them for CI to report.
  }
  execFileSync("npm", ["run", "format"], { stdio: "inherit" });
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf-8" });
  if (status.trim() === "") {
    return;
  }
  execFileSync("git", ["add", "-A"], { stdio: "inherit" });
  execFileSync("git", ["commit", "-m", "Fix lint and formatting"], { stdio: "inherit" });
  execFileSync("git", ["push", "origin", branch], { stdio: "inherit" });
  console.log(`Auto-fixed lint/formatting on ${branch}.`);
}

// Squash-merges a clean PR and removes its branch (remote + local). Only
// called once review found nothing outstanding — still gated on CI
// passing, since a clean review says nothing about build/test health.
async function mergeAndCleanUp(prNumber: string, branch: string): Promise<void> {
  try {
    execFileSync("gh", ["pr", "checks", prNumber, "--watch", "--fail-fast"], {
      stdio: "inherit",
    });
  } catch (err) {
    console.error(`PR #${prNumber} has failing/pending checks — leaving open for a human.`, err);
    return;
  }

  try {
    execFileSync("gh", ["pr", "merge", prNumber, "--squash", "--delete-branch"], {
      stdio: "inherit",
    });
  } catch (err) {
    console.error(`Merge failed for PR #${prNumber} — leaving open for a human.`, err);
    return;
  }

  // gh's --delete-branch removes the remote branch; the host's local
  // clone still has its own ref (main.mts pushed to it directly).
  try {
    execFileSync("git", ["branch", "-D", branch], { stdio: "ignore" });
  } catch {
    // No local ref to remove — fine.
  }
  console.log(`Merged PR #${prNumber} and deleted branch ${branch}.`);
}
