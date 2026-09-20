import { describe, it, expect, vi } from "vitest";
import { resolvePullRequest, type PullRequestCommands } from "./pr-resolution.mts";

const input = {
  branch: "ralph/issue-42",
  title: "Fix the thing",
  body: "A description.\n\nCloses #42",
};

function commands(overrides: Partial<PullRequestCommands> = {}): PullRequestCommands {
  return {
    push: vi.fn(),
    findOpenPullRequest: vi.fn().mockReturnValue(""),
    create: vi.fn().mockReturnValue("https://github.com/owner/repo/pull/7"),
    ...overrides,
  };
}

describe("resolvePullRequest", () => {
  it("creates a pull request when the branch has none open", () => {
    const cmd = commands();

    const resolved = resolvePullRequest(input, cmd);

    expect(resolved).toEqual({
      number: "7",
      reused: false,
      url: "https://github.com/owner/repo/pull/7",
    });
    expect(cmd.push).toHaveBeenCalledWith("ralph/issue-42");
    expect(cmd.create).toHaveBeenCalledWith(input);
  });

  // The failure this exists to prevent: a retried issue resumes onto the same
  // branch, `gh pr create` refuses a second PR for it, and the finished work
  // was stranded because the harness treated that refusal as a failed run.
  it("reuses the open pull request instead of creating a second one", () => {
    const cmd = commands({ findOpenPullRequest: vi.fn().mockReturnValue("7") });

    const resolved = resolvePullRequest(input, cmd);

    expect(resolved).toEqual({ number: "7", reused: true });
    expect(cmd.create).not.toHaveBeenCalled();
  });

  // Deliberate: a reused pull request keeps the description from the attempt
  // that opened it. See the note in pr-resolution.mts.
  it("leaves a reused pull request's description alone", () => {
    const cmd = commands({ findOpenPullRequest: vi.fn().mockReturnValue("7") });

    resolvePullRequest({ ...input, body: "A later attempt's description." }, cmd);

    expect(cmd.create).not.toHaveBeenCalled();
  });

  it("pushes before looking a pull request up, so the lookup sees the branch", () => {
    const order: string[] = [];
    const cmd = commands({
      push: vi.fn(() => {
        order.push("push");
      }),
      findOpenPullRequest: vi.fn(() => {
        order.push("lookup");
        return "";
      }),
    });

    resolvePullRequest(input, cmd);

    expect(order).toEqual(["push", "lookup"]);
  });

  it("propagates a failing lookup rather than creating a duplicate", () => {
    const cmd = commands({
      findOpenPullRequest: vi.fn(() => {
        throw new Error("gh: could not reach GitHub");
      }),
    });

    expect(() => resolvePullRequest(input, cmd)).toThrow("gh: could not reach GitHub");
    expect(cmd.create).not.toHaveBeenCalled();
  });

  it("propagates a failing push", () => {
    const cmd = commands({
      push: vi.fn(() => {
        throw new Error("failed to push some refs");
      }),
    });

    expect(() => resolvePullRequest(input, cmd)).toThrow("failed to push some refs");
    expect(cmd.findOpenPullRequest).not.toHaveBeenCalled();
  });
});
