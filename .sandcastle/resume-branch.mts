import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GIT_IDENTITY_EMAIL, GIT_IDENTITY_NAME } from "./git-identity.mts";

// Bring a resumed ralph/issue-N branch up to date with the base before the
// agent starts on it. Sandcastle only honours baseBranch when it creates the
// branch; for one an earlier attempt left behind it checks out the old tip as
// is. #106 resumed a nine-day-old branch that way, and after master's history
// was rewritten every old ralph/* branch carried the pre-rewrite commits.
//
// Kept in its own module (like pr-resolution.mts) so the decision sequence is
// unit-testable without git or a sandbox.

// "fresh", "up-to-date" and "rebased" let the attempt go ahead. The rest need
// a person, and leave the branch exactly as it was.
export type ResumeOutcome =
  | "fresh"
  | "up-to-date"
  | "rebased"
  | "diverged"
  | "foreign-commits"
  | "conflict";

// Every command takes the base before the branch, where it takes both.
export interface ResumeBranchCommands {
  // The branch's commit on origin, or "" when origin has no such branch.
  remoteBranchSha(branch: string): string;
  fetchRemoteBranch(branch: string): void;
  branchExists(branch: string): boolean;
  createBranch(branch: string, sha: string): void;
  // Commits reachable from remoteSha with no patch-equivalent on the branch.
  remoteOnlyCommits(branch: string, remoteSha: string): string[];
  isAncestor(ancestor: string, descendant: string): boolean;
  // Author email of every commit in base..branch, merge parents included.
  authorEmails(base: string, branch: string): string[];
  // True on a clean rebase. On failure the rebase is aborted, not left half-done.
  rebase(base: string, branch: string): boolean;
  forcePush(branch: string, expectedRemoteSha: string): void;
}

export function syncResumedBranch(
  base: string,
  branch: string,
  agentEmail: string,
  commands: ResumeBranchCommands = createGitCommands()
): ResumeOutcome {
  // Read before anything changes, so the force-push below leases on what an
  // earlier attempt pushed rather than on whatever origin holds by then.
  const remoteSha = commands.remoteBranchSha(branch);
  let exists = commands.branchExists(branch);

  if (remoteSha) {
    commands.fetchRemoteBranch(branch);
    if (!exists) {
      commands.createBranch(branch, remoteSha);
      exists = true;
    } else if (commands.remoteOnlyCommits(branch, remoteSha).length > 0) {
      // Pushed to the pull request since the local branch last saw origin,
      // most likely by a person. Rebasing and force-pushing would drop it.
      return "diverged";
    }
  }
  if (!exists) return "fresh";

  let outcome: ResumeOutcome = "up-to-date";
  if (!commands.isAncestor(base, branch)) {
    // Every commit the loop itself makes carries the agent identity. Anything
    // else on the branch is history the agent did not write — a rewritten-away
    // master, or human work merged in — and replaying it onto the base is not
    // a call to make unattended.
    if (commands.authorEmails(base, branch).some((email) => email !== agentEmail)) {
      return "foreign-commits";
    }
    if (!commands.rebase(base, branch)) return "conflict";
    outcome = "rebased";
  }

  // Later pushes are plain pushes, which origin rejects for a branch whose
  // history changed. Decided on every attempt, not only after a rebase, so a
  // push that failed last time is made good now.
  if (remoteSha && !commands.isAncestor(remoteSha, branch)) {
    commands.forcePush(branch, remoteSha);
  }
  return outcome;
}

// The real ones, used whenever a caller does not inject its own. repoDir is
// for the tests; main.mts runs from the repository root.
export function createGitCommands(repoDir?: string): ResumeBranchCommands {
  function git(args: string[], cwd = repoDir): string {
    return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
  }

  function succeeds(args: string[], cwd = repoDir): boolean {
    try {
      execFileSync("git", args, { cwd, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  // Sandcastle keeps a worktree per branch under .sandcastle/worktrees, and git
  // refuses to rebase a branch that is checked out somewhere else.
  function worktreeFor(branch: string): string | undefined {
    let current: string | undefined;
    for (const line of git(["worktree", "list", "--porcelain"]).split("\n")) {
      if (line.startsWith("worktree ")) current = line.slice("worktree ".length);
      if (line === `branch refs/heads/${branch}`) return current;
    }
    return undefined;
  }

  // Sandcastle keeps a worktree only when it holds uncommitted changes, so a
  // kept one is dirty and git would refuse to rebase it. The changes go into a
  // throwaway commit for the rebase and come back out uncommitted afterwards —
  // on the new base if it applied, on the old tip if it did not. Not
  // --autostash: the stash stack is shared with every other checkout.
  function rebaseIn(dir: string, base: string): boolean {
    const dirty = git(["status", "--porcelain"], dir) !== "";
    if (dirty) {
      git(["add", "-A"], dir);
      git(
        [
          "-c",
          `user.name=${GIT_IDENTITY_NAME}`,
          "-c",
          `user.email=${GIT_IDENTITY_EMAIL}`,
          "commit",
          "-q",
          "--no-verify",
          "-m",
          "Uncommitted work, set aside for a rebase",
        ],
        dir
      );
    }
    let clean = true;
    try {
      git(["rebase", "-q", base], dir);
    } catch {
      succeeds(["rebase", "--abort"], dir);
      clean = false;
    }
    if (dirty) git(["reset", "-q", "HEAD~1"], dir);
    return clean;
  }

  return {
    remoteBranchSha: (branch) =>
      git(["ls-remote", "--heads", "origin", branch]).split(/\s+/)[0] ?? "",
    fetchRemoteBranch: (branch) =>
      void git(["fetch", "-q", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`]),
    branchExists: (branch) =>
      succeeds(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]),
    createBranch: (branch, sha) => void git(["branch", branch, sha]),
    remoteOnlyCommits: (branch, remoteSha) =>
      git([
        "log",
        "--cherry-pick",
        "--right-only",
        "--no-merges",
        "--format=%H",
        `refs/heads/${branch}...${remoteSha}`,
      ])
        .split("\n")
        .filter(Boolean),
    isAncestor: (ancestor, descendant) =>
      succeeds(["merge-base", "--is-ancestor", ancestor, descendant]),
    authorEmails: (base, branch) =>
      git(["log", "--format=%ae", `${base}..refs/heads/${branch}`])
        .split("\n")
        .filter(Boolean),
    rebase(base, branch) {
      const existing = worktreeFor(branch);
      if (existing) return rebaseIn(existing, base);

      const dir = mkdtempSync(path.join(tmpdir(), "ralph-rebase-"));
      try {
        git(["worktree", "add", "-q", dir, branch]);
        return rebaseIn(dir, base);
      } finally {
        // Cleanup must not mask the rebase's own result.
        succeeds(["worktree", "remove", "--force", dir]);
        rmSync(dir, { recursive: true, force: true });
      }
    },
    // Through execFileSync directly, not git(): the push's progress belongs in
    // the run log.
    forcePush(branch, expectedRemoteSha) {
      execFileSync(
        "git",
        ["push", `--force-with-lease=${branch}:${expectedRemoteSha}`, "origin", branch],
        { cwd: repoDir, stdio: "inherit" }
      );
    },
  };
}
