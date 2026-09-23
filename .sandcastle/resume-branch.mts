import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Bring a resumed ralph/issue-N branch up to date with the base before the
// agent starts on it. Sandcastle only honours baseBranch when it creates the
// branch; for one an earlier attempt left behind it checks out the old tip as
// is. #106 resumed a nine-day-old branch that way, and after master's history
// was rewritten every old ralph/* branch carried the pre-rewrite commits.
//
// Kept in its own module (like pr-resolution.mts) so the decision sequence is
// unit-testable without git or a sandbox.

// "fresh" and "up-to-date" need nothing; "rebased" is done. The other two need
// a person: the branch is left exactly as it was.
export type ResumeOutcome = "fresh" | "up-to-date" | "rebased" | "foreign-commits" | "conflict";

export interface ResumeBranchCommands {
  branchExists(branch: string): boolean;
  isAncestor(ancestor: string, descendant: string): boolean;
  // Author email of every commit in base..branch, merge parents included.
  authorEmails(base: string, branch: string): string[];
  // True on a clean rebase. On failure the rebase is aborted, not left half-done.
  rebase(branch: string, base: string): boolean;
  // The branch's commit on origin, or "" when origin has no such branch.
  remoteBranchSha(branch: string): string;
  forcePush(branch: string, expectedRemoteSha: string): void;
}

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, { encoding: "utf-8", cwd }).trim();
}

function succeeds(args: string[]): boolean {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Sandcastle keeps a worktree per branch under .sandcastle/worktrees, and git
// refuses to rebase a branch that is checked out somewhere else. Rebase inside
// that worktree when there is one, and in a throwaway one otherwise.
function worktreeFor(branch: string): string | undefined {
  let current: string | undefined;
  for (const line of git(["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) current = line.slice("worktree ".length);
    if (line === `branch refs/heads/${branch}`) return current;
  }
  return undefined;
}

function rebaseIn(dir: string, base: string): boolean {
  try {
    git(["rebase", base], dir);
    return true;
  } catch {
    succeeds(["-C", dir, "rebase", "--abort"]);
    return false;
  }
}

const gitCommands: ResumeBranchCommands = {
  branchExists: (branch) => succeeds(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]),
  isAncestor: (ancestor, descendant) =>
    succeeds(["merge-base", "--is-ancestor", ancestor, descendant]),
  authorEmails: (base, branch) =>
    git(["log", "--format=%ae", `${base}..refs/heads/${branch}`])
      .split("\n")
      .filter(Boolean),
  rebase(branch, base) {
    const existing = worktreeFor(branch);
    if (existing) return rebaseIn(existing, base);

    const dir = mkdtempSync(path.join(tmpdir(), "ralph-rebase-"));
    git(["worktree", "add", "--quiet", dir, branch]);
    try {
      return rebaseIn(dir, base);
    } finally {
      git(["worktree", "remove", "--force", dir]);
    }
  },
  remoteBranchSha: (branch) =>
    git(["ls-remote", "--heads", "origin", branch]).split(/\s+/)[0] ?? "",
  forcePush(branch, expectedRemoteSha) {
    execFileSync(
      "git",
      ["push", `--force-with-lease=${branch}:${expectedRemoteSha}`, "origin", branch],
      { stdio: "inherit" }
    );
  },
};

export function syncResumedBranch(
  branch: string,
  base: string,
  agentEmail: string,
  commands: ResumeBranchCommands = gitCommands
): ResumeOutcome {
  if (!commands.branchExists(branch)) return "fresh";
  if (commands.isAncestor(base, branch)) return "up-to-date";

  // Every commit the loop itself makes carries the agent identity. Anything
  // else on the branch is history the agent did not write — a rewritten-away
  // master, or human work merged in — and replaying it onto the base is not a
  // call to make unattended.
  if (commands.authorEmails(base, branch).some((email) => email !== agentEmail)) {
    return "foreign-commits";
  }

  if (!commands.rebase(branch, base)) return "conflict";

  // Later pushes are plain pushes, which origin would reject for a branch
  // whose history just changed. The lease stops this from overwriting anything
  // pushed to origin since it was read.
  const remoteSha = commands.remoteBranchSha(branch);
  if (remoteSha) commands.forcePush(branch, remoteSha);
  return "rebased";
}
