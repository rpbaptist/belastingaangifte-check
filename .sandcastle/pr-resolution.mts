import { execFileSync } from "node:child_process";

// Push the agent's branch and end up with a pull request number for it, either
// a freshly created one or the one an earlier attempt left open. Kept in its
// own module (like classify-run-error.mts and review-outcome.mts) so the
// decision sequence is unit-testable without starting a sandbox, which is what
// AGENTS.md asks of a route handler and applies here for the same reason.

export interface PullRequestInput {
  branch: string;
  title: string;
  body: string;
}

// The three side effects, injected so a test can watch the order they happen
// in and what happens when one of them fails.
export interface PullRequestCommands {
  push(branch: string): void;
  // The pull request number for the branch, or "" when none is open.
  findOpenPullRequest(branch: string): string;
  // The URL of the created pull request.
  create(input: PullRequestInput): string;
}

export interface ResolvedPullRequest {
  number: string;
  reused: boolean;
  // Only a created pull request has one: the lookup returns a number alone,
  // and the run logs are read often enough that printing the URL is worth
  // carrying it back.
  url?: string;
}

// The real ones, used whenever a caller does not inject its own.
const gitHubCommands: PullRequestCommands = {
  push(branch) {
    execFileSync("git", ["push", "-u", "origin", branch], { stdio: "inherit" });
  },
  findOpenPullRequest(branch) {
    return execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--head",
        branch,
        "--base",
        "master",
        "--state",
        "open",
        "--json",
        "number",
        "-q",
        ".[0].number",
      ],
      { encoding: "utf-8" }
    ).trim();
  },
  create(input) {
    return execFileSync(
      "gh",
      ["pr", "create", "--head", input.branch, "--title", input.title, "--body", input.body],
      { encoding: "utf-8" }
    ).trim();
  },
};

// A retried issue resumes onto the same branch, so a pull request from an
// earlier attempt may already be open. `gh pr create` fails hard in that case,
// which used to strand finished work: the loop recorded a failure and the
// review pass never ran. Every attempt after the first depends on the reuse.
//
// A reused pull request keeps the title and description from the attempt that
// opened it. Refreshing them would overwrite the first attempt's summary with
// one written by a session that resumed part-way and describes only what it
// added, and it would discard any edit a human made to the description while
// the pull request sat open. The later attempt's work is visible in the
// commits and in the review pass either way.
export function resolvePullRequest(
  input: PullRequestInput,
  commands: PullRequestCommands = gitHubCommands
): ResolvedPullRequest {
  commands.push(input.branch);

  const existing = commands.findOpenPullRequest(input.branch);
  if (existing) {
    return { number: existing, reused: true };
  }

  const url = commands.create(input);
  return { number: url.split("/").pop()!, reused: false, url };
}
