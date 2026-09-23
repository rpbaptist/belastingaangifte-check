import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createGitCommands,
  syncResumedBranch,
  type ResumeBranchCommands,
} from "./resume-branch.mts";

const BRANCH = "ralph/issue-42";
const BASE = "origin/master";
const AGENT = "ralph-agent@users.noreply.github.com";

function commands(overrides: Partial<ResumeBranchCommands> = {}): ResumeBranchCommands {
  return {
    remoteBranchSha: vi.fn().mockReturnValue(""),
    fetchRemoteBranch: vi.fn(),
    branchExists: vi.fn().mockReturnValue(true),
    createBranch: vi.fn(),
    remoteOnlyCommits: vi.fn().mockReturnValue([]),
    isAncestor: vi.fn().mockReturnValue(false),
    authorEmails: vi.fn().mockReturnValue([AGENT, AGENT]),
    rebase: vi.fn().mockReturnValue(true),
    forcePush: vi.fn(),
    ...overrides,
  };
}

describe("syncResumedBranch", () => {
  it("leaves a first attempt alone: Sandcastle branches it from the base", () => {
    const cmd = commands({ branchExists: vi.fn().mockReturnValue(false) });

    expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("fresh");
    expect(cmd.rebase).not.toHaveBeenCalled();
  });

  it("leaves a resumed branch alone when it already contains the base", () => {
    const cmd = commands({ isAncestor: vi.fn().mockReturnValue(true) });

    expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("up-to-date");
    expect(cmd.rebase).not.toHaveBeenCalled();
  });

  // #106 resumed a nine-day-old branch: Sandcastle ignores baseBranch for a
  // branch that exists, so the agent never saw what had landed since.
  it("rebases a resumed branch that is behind the base", () => {
    const cmd = commands();

    expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("rebased");
    expect(cmd.rebase).toHaveBeenCalledWith(BASE, BRANCH);
  });

  // After master's history was rewritten, every old ralph/* branch still
  // carried the pre-rewrite commits. Replaying them would put the rewritten-out
  // content back into a pull request.
  it("refuses to rebase a branch holding commits the agent did not author", () => {
    const cmd = commands({
      authorEmails: vi.fn().mockReturnValue([AGENT, "someone@example.com"]),
    });

    expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("foreign-commits");
    expect(cmd.authorEmails).toHaveBeenCalledWith(BASE, BRANCH);
    expect(cmd.rebase).not.toHaveBeenCalled();
  });

  it("reports a conflict when the rebase does not apply cleanly", () => {
    const cmd = commands({ rebase: vi.fn().mockReturnValue(false) });

    expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("conflict");
    expect(cmd.forcePush).not.toHaveBeenCalled();
  });

  describe("with the branch on origin", () => {
    // Every later push (build, review, tidy) is a plain push. A rebased branch
    // that an earlier attempt already pushed would be rejected as
    // non-fast-forward unless origin is brought along now.
    it("force-pushes a rebased branch, leasing on the sha read before the rebase", () => {
      const cmd = commands({
        remoteBranchSha: vi.fn().mockReturnValue("abc123"),
        isAncestor: vi.fn((ancestor: string) => ancestor === "never"),
      });

      syncResumedBranch(BASE, BRANCH, AGENT, cmd);

      expect(cmd.forcePush).toHaveBeenCalledWith(BRANCH, "abc123");
    });

    // A push that failed after a clean rebase leaves the local branch rebased
    // and origin on the old tip. The next attempt finds nothing to rebase but
    // must still bring origin along, or every later plain push fails.
    it("force-pushes an up-to-date branch that origin has not caught up with", () => {
      const cmd = commands({
        remoteBranchSha: vi.fn().mockReturnValue("abc123"),
        isAncestor: vi.fn((ancestor: string) => ancestor === BASE),
      });

      expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("up-to-date");
      expect(cmd.forcePush).toHaveBeenCalledWith(BRANCH, "abc123");
    });

    it("does not force-push when origin is already behind the local branch", () => {
      const cmd = commands({
        remoteBranchSha: vi.fn().mockReturnValue("abc123"),
        isAncestor: vi.fn().mockReturnValue(true),
      });

      syncResumedBranch(BASE, BRANCH, AGENT, cmd);

      expect(cmd.forcePush).not.toHaveBeenCalled();
    });

    // A person may push a fix to the pull request between attempts. Rebasing
    // and force-pushing the local branch would silently drop it.
    it("refuses a branch whose origin copy holds commits the local one lacks", () => {
      const cmd = commands({
        remoteBranchSha: vi.fn().mockReturnValue("abc123"),
        remoteOnlyCommits: vi.fn().mockReturnValue(["def456"]),
      });

      expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("diverged");
      expect(cmd.fetchRemoteBranch).toHaveBeenCalledWith(BRANCH);
      expect(cmd.remoteOnlyCommits).toHaveBeenCalledWith(BRANCH, "abc123");
      expect(cmd.rebase).not.toHaveBeenCalled();
      expect(cmd.forcePush).not.toHaveBeenCalled();
    });

    // Otherwise Sandcastle creates the branch from whatever origin/ralph/issue-N
    // the host last fetched, and nothing rebases it.
    it("recreates a branch that exists only on origin, then syncs it", () => {
      const cmd = commands({
        remoteBranchSha: vi.fn().mockReturnValue("abc123"),
        branchExists: vi.fn().mockReturnValue(false),
      });

      expect(syncResumedBranch(BASE, BRANCH, AGENT, cmd)).toBe("rebased");
      expect(cmd.createBranch).toHaveBeenCalledWith(BRANCH, "abc123");
    });
  });
});

// The real git commands, against a scratch origin and clone. Sandcastle keeps
// a branch's worktree only when it is dirty, so a dirty worktree is the normal
// case for a resumed branch, not an edge case.
describe("createGitCommands", () => {
  let root: string;
  let repo: string;
  let worktree: string;

  const agent = ["-c", `user.email=${AGENT}`, "-c", "user.name=Ralph"];

  function git(args: string[], cwd = repo): string {
    return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
  }

  // Untrimmed: porcelain lines start with a space for an unstaged change.
  function status(cwd: string): string[] {
    return execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf-8" })
      .split("\n")
      .filter(Boolean)
      .sort();
  }

  function commit(file: string, content: string, cwd = repo, identity = agent): void {
    writeFileSync(path.join(cwd, file), content);
    git(["add", file], cwd);
    git([...identity, "commit", "-q", "-m", `Write ${file}`], cwd);
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "resume-branch-test-"));
    repo = path.join(root, "repo");
    worktree = path.join(root, "worktree");
    git(["init", "-q", "--bare", "-b", "master", path.join(root, "origin.git")], root);
    git(["clone", "-q", path.join(root, "origin.git"), repo], root);
    git(["config", "user.email", "human@example.com"]);
    git(["config", "user.name", "Human"]);
    commit("base.txt", "base\n", repo, []);
    git(["push", "-q", "origin", "master"]);
    git(["checkout", "-q", "-b", BRANCH]);
    commit("work.txt", "work\n");
    git(["push", "-q", "origin", BRANCH]);
    git(["checkout", "-q", "master"]);
    commit("landed.txt", "landed\n", repo, []);
    git(["push", "-q", "origin", "master"]);
    git(["fetch", "-q", "origin"]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("rebases a dirty Sandcastle worktree and leaves its changes uncommitted", () => {
    git(["worktree", "add", "-q", worktree, BRANCH]);
    writeFileSync(path.join(worktree, "work.txt"), "work, continued\n");
    writeFileSync(path.join(worktree, "new.txt"), "not yet added\n");

    const outcome = syncResumedBranch(BASE, BRANCH, AGENT, createGitCommands(repo));

    expect(outcome).toBe("rebased");
    expect(git(["log", "--format=%s", `${BASE}..${BRANCH}`])).toBe("Write work.txt");
    expect(existsSync(path.join(worktree, "landed.txt"))).toBe(true);
    expect(readFileSync(path.join(worktree, "work.txt"), "utf-8")).toBe("work, continued\n");
    expect(status(worktree)).toEqual([" M work.txt", "?? new.txt"]);
  });

  it("force-pushes the rebased branch to origin", () => {
    syncResumedBranch(BASE, BRANCH, AGENT, createGitCommands(repo));

    const remote = git(["ls-remote", "--heads", "origin", BRANCH]).split(/\s+/)[0];
    expect(remote).toBe(git(["rev-parse", BRANCH]));
  });

  it("leaves a conflicting branch, its worktree and its changes exactly as they were", () => {
    git(["checkout", "-q", BRANCH]);
    commit("landed.txt", "the branch's own version\n");
    git(["checkout", "-q", "master"]);
    const tipBefore = git(["rev-parse", BRANCH]);
    git(["worktree", "add", "-q", worktree, BRANCH]);
    writeFileSync(path.join(worktree, "work.txt"), "work, continued\n");

    const outcome = syncResumedBranch(BASE, BRANCH, AGENT, createGitCommands(repo));

    expect(outcome).toBe("conflict");
    expect(git(["rev-parse", BRANCH])).toBe(tipBefore);
    expect(status(worktree)).toEqual([" M work.txt"]);
  });

  it("finds a commit pushed to origin that the local branch does not have", () => {
    git(["worktree", "add", "-q", worktree, BRANCH]);
    commit("fix.txt", "a person's fix\n", worktree, []);
    git(["push", "-q", "origin", BRANCH], worktree);
    git(["reset", "-q", "--hard", "HEAD~1"], worktree);

    const outcome = syncResumedBranch(BASE, BRANCH, AGENT, createGitCommands(repo));

    expect(outcome).toBe("diverged");
  });

  it("recovers from a push that failed after a clean rebase", () => {
    const oldRemote = git(["rev-parse", BRANCH]);
    git(["checkout", "-q", BRANCH]);
    git(["rebase", "-q", BASE]);
    git(["checkout", "-q", "master"]);
    expect(git(["ls-remote", "--heads", "origin", BRANCH]).split(/\s+/)[0]).toBe(oldRemote);

    const outcome = syncResumedBranch(BASE, BRANCH, AGENT, createGitCommands(repo));

    expect(outcome).toBe("up-to-date");
    expect(git(["ls-remote", "--heads", "origin", BRANCH]).split(/\s+/)[0]).toBe(
      git(["rev-parse", BRANCH])
    );
  });
});
