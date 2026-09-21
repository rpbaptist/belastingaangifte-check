import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// tidy-branch.sh runs inside a sandbox, on the pull request's branch, right
// before the merge gate. These tests run it the same way — piped to bash, in a
// checkout of the branch — against a scratch repo, with npx and npm stubbed so
// that "lint" and "format" do whatever a test needs them to.

const SCRIPT = readFileSync(path.join(import.meta.dirname, "tidy-branch.sh"), "utf-8");

let repoDir: string;
let stubBinDir: string;

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: repoDir, encoding: "utf-8" });
}

function stub(name: string, lines: string[]) {
  const file = path.join(stubBinDir, name);
  writeFileSync(file, ["#!/usr/bin/env bash", ...lines].join("\n"));
  chmodSync(file, 0o755);
}

function tidy(): string {
  return execFileSync("bash", ["-s"], {
    cwd: repoDir,
    input: SCRIPT,
    encoding: "utf-8",
    env: { ...process.env, PATH: `${stubBinDir}:${process.env.PATH}` },
  });
}

function subjects(): string[] {
  return git(["log", "--format=%s"]).trim().split("\n");
}

beforeEach(() => {
  repoDir = mkdtempSync(path.join(tmpdir(), "tidy-branch-test-"));
  git(["init", "-q", "-b", "ralph/issue-7"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  writeFileSync(path.join(repoDir, "app.ts"), "export const a = 1;\n");
  git(["add", "app.ts"]);
  git(["commit", "-q", "-m", "Real work"]);

  stubBinDir = mkdtempSync(path.join(tmpdir(), "tidy-branch-stub-"));
  stub("npx", ["exit 0"]);
  stub("npm", ["exit 0"]);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(stubBinDir, { recursive: true, force: true });
});

describe("tidy-branch.sh", () => {
  it("commits nothing when the branch is already tidy", () => {
    tidy();

    expect(subjects()).toEqual(["Real work"]);
  });

  // The build agent commits checkpoint notes so a resumed attempt can pick up
  // where it stopped. They mean nothing once the work is done, and a squash
  // merge would otherwise carry them onto master.
  it("removes the agent's progress notes in a commit of their own", () => {
    mkdirSync(path.join(repoDir, ".sandcastle/progress"), { recursive: true });
    writeFileSync(path.join(repoDir, ".sandcastle/progress/issue-7.md"), "notes\n");
    git(["add", ".sandcastle/progress"]);
    git(["commit", "-q", "-m", "Progress notes: issue #7"]);

    tidy();

    expect(subjects()[0]).toBe("Remove progress notes");
    expect(git(["ls-files", ".sandcastle/progress"]).trim()).toBe("");
  });

  it("commits whatever the formatter changes", () => {
    stub("npm", [`echo "export const a = 2;" > app.ts`]);

    tidy();

    expect(subjects()[0]).toBe("Fix lint and formatting");
    expect(git(["status", "--porcelain"]).trim()).toBe("");
  });

  // eslint --fix exits non-zero when errors it cannot fix remain. That is for
  // CI to report, not a reason to skip the formatter.
  it("still formats when lint reports errors it cannot fix", () => {
    stub("npx", ["exit 1"]);
    stub("npm", [`echo "export const a = 2;" > app.ts`]);

    tidy();

    expect(subjects()[0]).toBe("Fix lint and formatting");
  });
});
