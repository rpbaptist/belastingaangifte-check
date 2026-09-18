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
}
