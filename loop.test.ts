import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// loop.sh is a host script that talks to a real git repo and the `gh`
// CLI. These tests exercise it exactly like production does: a real git
// repo (scratch, per test) and a stub `gh` binary prepended to PATH, with
// loop.sh's functions invoked directly via `source` (see the
// BASH_SOURCE guard added to loop.sh for exactly this purpose).

let repoDir: string;
let stubBinDir: string;

function git(args: string[], cwd = repoDir) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

function runLoopFn(fn: string, cwd = repoDir) {
  const loopShPath = path.resolve(__dirname, "loop.sh");
  return execFileSync("bash", ["-c", `source "${loopShPath}"; ${fn}`], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, PATH: `${stubBinDir}:${process.env.PATH}` },
  });
}

// Replaces the stub `gh` with one that logs every invocation's argv (one
// line per call) to a file the test can assert against, and answers
// `gh issue view ... --json labels -q '.labels[].name'` with a
// caller-supplied label list — everything else is a silent no-op, same
// as the default stub.
function stubGhWithCallLog(labels: string[] = []): { callLogPath: string } {
  const callLogPath = path.join(repoDir, "gh-calls.log");
  const labelsLine = labels.join("\\n");
  writeFileSync(
    path.join(stubBinDir, "gh"),
    [
      "#!/usr/bin/env bash",
      `echo "$@" >> "${callLogPath}"`,
      'if [[ "$1 $2" == "issue view" ]]; then',
      `  printf '${labelsLine}\\n'`,
      "fi",
      "exit 0",
    ].join("\n")
  );
  execFileSync("chmod", ["+x", path.join(stubBinDir, "gh")]);
  return { callLogPath };
}

function stubSessionLimitNpx() {
  writeFileSync(
    path.join(stubBinDir, "npx"),
    [
      "#!/usr/bin/env bash",
      'echo "agent output"',
      'echo "You\'ve hit your session limit \\xc2\\xb7 resets 11:50am (UTC)"',
      "exit 1",
    ].join("\n")
  );
  execFileSync("chmod", ["+x", path.join(stubBinDir, "npx")]);
  writeFileSync(path.join(stubBinDir, "sleep"), "#!/usr/bin/env bash\nexit 0\n");
  execFileSync("chmod", ["+x", path.join(stubBinDir, "sleep")]);
}

function readCallLog(callLogPath: string): string[] {
  try {
    return readFileSync(callLogPath, "utf-8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

beforeEach(() => {
  repoDir = mkdtempSync(path.join(tmpdir(), "loop-sh-test-"));
  git(["init", "-q", "-b", "master"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  writeFileSync(path.join(repoDir, "README.md"), "seed\n");
  git(["add", "README.md"]);
  git(["commit", "-q", "-m", "Initial commit"]);

  stubBinDir = mkdtempSync(path.join(tmpdir(), "gh-stub-"));
  // Tests in this file don't exercise gh-calling paths yet; stub exists
  // so PATH is consistent as more behaviors are added.
  writeFileSync(path.join(stubBinDir, "gh"), "#!/usr/bin/env bash\nexit 0\n");
  execFileSync("chmod", ["+x", path.join(stubBinDir, "gh")]);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(stubBinDir, { recursive: true, force: true });
});

describe("write_progress_note", () => {
  it("creates ralph/issue-N from master and commits the note when the branch doesn't exist", () => {
    const logFile = path.join(repoDir, "attempt.log");
    writeFileSync(
      logFile,
      "some agent output\nYou've hit your session limit · resets 11:50am (UTC)\n"
    );

    runLoopFn(`write_progress_note 42 "${logFile}"`);

    const branches = git(["branch", "--list", "ralph/issue-42"]);
    expect(branches).toContain("ralph/issue-42");

    const log = git(["log", "--format=%s", "ralph/issue-42"]);
    expect(log.trim().split("\n")[0]).toBe("Progress notes: issue #42");

    const noteContent = git(["show", "ralph/issue-42:.sandcastle/progress/issue-42.md"]);
    expect(noteContent).toContain("11:50am (UTC)");
    expect(noteContent).toContain(logFile);
  });

  it("adds a new commit without disturbing existing work when the branch already exists", () => {
    git(["checkout", "-q", "-b", "ralph/issue-7"]);
    writeFileSync(path.join(repoDir, "feature.ts"), "export const x = 1;\n");
    git(["add", "feature.ts"]);
    git(["commit", "-q", "-m", "Add feature.ts"]);
    git(["checkout", "-q", "master"]);

    const logFile = path.join(repoDir, "attempt2.log");
    writeFileSync(logFile, "You've hit your session limit · resets 3:15pm (UTC)\n");

    runLoopFn(`write_progress_note 7 "${logFile}"`);

    const log = git(["log", "--format=%s", "ralph/issue-7"]);
    const subjects = log.trim().split("\n");
    expect(subjects[0]).toBe("Progress notes: issue #7");
    expect(subjects).toContain("Add feature.ts");

    const featureContent = git(["show", "ralph/issue-7:feature.ts"]);
    expect(featureContent).toBe("export const x = 1;\n");
  });
});

describe("run_build_iteration on a session-limit failure", () => {
  it("leaves the branch in place with the progress note, surviving the empty-branch cleanup", () => {
    // Stub npx so the "sandbox" call fails with a session-limit message,
    // and stub sleep so wait_out_session_limit doesn't actually block
    // the test on a real reset-time wait.
    writeFileSync(
      path.join(stubBinDir, "npx"),
      [
        "#!/usr/bin/env bash",
        'echo "agent output"',
        'echo "You\'ve hit your session limit \\xc2\\xb7 resets 11:50am (UTC)"',
        "exit 1",
      ].join("\n")
    );
    execFileSync("chmod", ["+x", path.join(stubBinDir, "npx")]);
    writeFileSync(path.join(stubBinDir, "sleep"), "#!/usr/bin/env bash\nexit 0\n");
    execFileSync("chmod", ["+x", path.join(stubBinDir, "sleep")]);

    // ralph/issue-55 already exists with zero commits ahead of master —
    // the exact shape the empty-branch cleanup targets for deletion.
    git(["branch", "ralph/issue-55"]);

    const issueJson = JSON.stringify({
      number: 55,
      title: "Test issue",
      body: "body",
    });
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, issueJson);

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    const branches = git(["branch", "--list", "ralph/issue-55"]);
    expect(branches).toContain("ralph/issue-55");

    const log = git(["log", "--format=%s", "ralph/issue-55"]);
    expect(log.trim().split("\n")[0]).toBe("Progress notes: issue #55");

    const commitCount = git(["rev-list", "--count", "master..ralph/issue-55"]).trim();
    expect(commitCount).toBe("1");
  });
});

describe("session-limit detection", () => {
  it("matches a differently-cased session-limit message", () => {
    const logFile = path.join(repoDir, "cased.log");
    writeFileSync(logFile, "You've Hit Your SESSION LIMIT · resets 9:00am (UTC)\n");

    const output = runLoopFn(`is_transient_failure "${logFile}" && echo MATCHED || echo NO_MATCH`);
    expect(output.trim()).toBe("MATCHED");
  });
});

describe("session-limit anomaly detection (#121)", () => {
  it("first-ever session-limit hit: labels session-limit-seen, writes note, does not block", () => {
    const { callLogPath } = stubGhWithCallLog([]); // no labels on the issue yet
    stubSessionLimitNpx();

    const issueJson = JSON.stringify({ number: 60, title: "Test issue", body: "body" });
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, issueJson);

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.includes("--add-label session-limit-seen"))).toBe(true);
    expect(calls.some((c) => c.includes("blocked-for-agent"))).toBe(false);

    const commitCount = git(["rev-list", "--count", "master..ralph/issue-60"]).trim();
    expect(commitCount).toBe("1");
  });

  it("second hit with the prior note still present: continues normally, no block", () => {
    // Simulate the first hit already having happened: branch exists with
    // one progress-note commit, and the label is already on the issue.
    runLoopFn(
      `write_progress_note 61 "${(() => {
        const f = path.join(repoDir, "first-attempt.log");
        writeFileSync(f, "You've hit your session limit · resets 11:50am (UTC)\n");
        return f;
      })()}"`
    );

    const { callLogPath } = stubGhWithCallLog(["session-limit-seen", "in-progress-by-agent"]);
    stubSessionLimitNpx();

    const issueJson = JSON.stringify({ number: 61, title: "Test issue", body: "body" });
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, issueJson);

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.includes("blocked-for-agent"))).toBe(false);
    expect(calls.some((c) => c.includes("--remove-label session-limit-seen"))).toBe(false);

    const commitCount = git(["rev-list", "--count", "master..ralph/issue-61"]).trim();
    expect(commitCount).toBe("2");
  });

  it("second hit with no surviving note: blocks instead of retrying, does not write another note", () => {
    // Label says we've been here before, but ralph/issue-62 doesn't even
    // exist locally — the state-loss scenario (host reset, branch
    // deleted, fresh clone).
    const { callLogPath } = stubGhWithCallLog(["session-limit-seen", "in-progress-by-agent"]);
    stubSessionLimitNpx();

    const issueJson = JSON.stringify({ number: 62, title: "Test issue", body: "body" });
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, issueJson);

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.includes("--add-label blocked-for-agent"))).toBe(true);
    expect(calls.some((c) => c.includes("--remove-label session-limit-seen"))).toBe(true);
    expect(calls.some((c) => c.startsWith("issue comment 62"))).toBe(true);

    // No note written, no branch created for this run.
    const branches = git(["branch", "--list", "ralph/issue-62"]);
    expect(branches).not.toContain("ralph/issue-62");
  });

  it("success path clears session-limit-seen alongside the other labels", () => {
    writeFileSync(
      path.join(stubBinDir, "npx"),
      [
        "#!/usr/bin/env bash",
        'echo "sandbox succeeded"',
        "exit 0",
      ].join("\n")
    );
    execFileSync("chmod", ["+x", path.join(stubBinDir, "npx")]);

    const { callLogPath } = stubGhWithCallLog(["session-limit-seen"]);

    const issueJson = JSON.stringify({ number: 63, title: "Test issue", body: "body" });
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, issueJson);

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    const calls = readCallLog(callLogPath);
    expect(
      calls.some(
        (c) => c.includes("--remove-label session-limit-seen") && c.startsWith("issue edit 63")
      )
    ).toBe(true);
  });

  it("issue_has_label treats a gh failure as absent but warns instead of failing silently", () => {
    writeFileSync(
      path.join(stubBinDir, "gh"),
      [
        "#!/usr/bin/env bash",
        'if [[ "$1 $2" == "issue view" ]]; then',
        '  echo "gh: connection reset" >&2',
        "  exit 1",
        "fi",
        "exit 0",
      ].join("\n")
    );
    execFileSync("chmod", ["+x", path.join(stubBinDir, "gh")]);

    let stderr = "";
    let exitCode = 0;
    try {
      execFileSync(
        "bash",
        ["-c", `source "${path.resolve(__dirname, "loop.sh")}"; issue_has_label 64 session-limit-seen`],
        { cwd: repoDir, encoding: "utf-8", env: { ...process.env, PATH: `${stubBinDir}:${process.env.PATH}` } }
      );
    } catch (err: unknown) {
      const execErr = err as { status: number; stderr: string };
      exitCode = execErr.status;
      stderr = execErr.stderr;
    }

    expect(exitCode).toBe(1); // fails safe: treated as label absent
    expect(stderr).toContain('Warning: gh issue view failed for #64 while checking for label "session-limit-seen"');
    expect(stderr).toContain("connection reset");
  });
});
