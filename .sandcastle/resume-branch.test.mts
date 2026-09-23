import { describe, it, expect, vi } from "vitest";
import { syncResumedBranch, type ResumeBranchCommands } from "./resume-branch.mts";

const BRANCH = "ralph/issue-42";
const BASE = "origin/master";
const AGENT = "ralph-agent@users.noreply.github.com";

function commands(overrides: Partial<ResumeBranchCommands> = {}): ResumeBranchCommands {
  return {
    branchExists: vi.fn().mockReturnValue(true),
    isAncestor: vi.fn().mockReturnValue(false),
    authorEmails: vi.fn().mockReturnValue([AGENT, AGENT]),
    rebase: vi.fn().mockReturnValue(true),
    remoteBranchSha: vi.fn().mockReturnValue(""),
    forcePush: vi.fn(),
    ...overrides,
  };
}

describe("syncResumedBranch", () => {
  it("leaves a first attempt alone: Sandcastle branches it from the base", () => {
    const cmd = commands({ branchExists: vi.fn().mockReturnValue(false) });

    expect(syncResumedBranch(BRANCH, BASE, AGENT, cmd)).toBe("fresh");
    expect(cmd.rebase).not.toHaveBeenCalled();
  });

  it("leaves a resumed branch alone when it already contains the base", () => {
    const cmd = commands({ isAncestor: vi.fn().mockReturnValue(true) });

    expect(syncResumedBranch(BRANCH, BASE, AGENT, cmd)).toBe("up-to-date");
    expect(cmd.rebase).not.toHaveBeenCalled();
  });

  // #106 resumed a nine-day-old branch: Sandcastle ignores baseBranch for a
  // branch that exists, so the agent never saw what had landed since.
  it("rebases a resumed branch that is behind the base", () => {
    const cmd = commands();

    expect(syncResumedBranch(BRANCH, BASE, AGENT, cmd)).toBe("rebased");
    expect(cmd.rebase).toHaveBeenCalledWith(BRANCH, BASE);
  });

  // After master's history was rewritten, every old ralph/* branch still
  // carried the pre-rewrite commits. Replaying them would put the rewritten-out
  // content back into a pull request.
  it("refuses to rebase a branch holding commits the agent did not author", () => {
    const cmd = commands({
      authorEmails: vi.fn().mockReturnValue([AGENT, "someone@example.com"]),
    });

    expect(syncResumedBranch(BRANCH, BASE, AGENT, cmd)).toBe("foreign-commits");
    expect(cmd.authorEmails).toHaveBeenCalledWith(BASE, BRANCH);
    expect(cmd.rebase).not.toHaveBeenCalled();
  });

  it("reports a conflict when the rebase does not apply cleanly", () => {
    const cmd = commands({ rebase: vi.fn().mockReturnValue(false) });

    expect(syncResumedBranch(BRANCH, BASE, AGENT, cmd)).toBe("conflict");
    expect(cmd.forcePush).not.toHaveBeenCalled();
  });

  // Every later push (build, review, tidy) is a plain push. A rebased branch
  // that an earlier attempt already pushed would be rejected as non-fast-forward
  // unless origin is brought along now.
  it("force-pushes a rebased branch that already exists on origin, with a lease", () => {
    const cmd = commands({ remoteBranchSha: vi.fn().mockReturnValue("abc123") });

    syncResumedBranch(BRANCH, BASE, AGENT, cmd);

    expect(cmd.forcePush).toHaveBeenCalledWith(BRANCH, "abc123");
  });

  it("does not push a rebased branch that exists only locally", () => {
    const cmd = commands();

    syncResumedBranch(BRANCH, BASE, AGENT, cmd);

    expect(cmd.forcePush).not.toHaveBeenCalled();
  });
});
