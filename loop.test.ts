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

function stubNpx(lines: string[]) {
  writeFileSync(path.join(stubBinDir, "npx"), ["#!/usr/bin/env bash", ...lines].join("\n"));
  execFileSync("chmod", ["+x", path.join(stubBinDir, "npx")]);
}

function stubSessionLimitNpx() {
  stubNpx([
    'echo "agent output"',
    'echo "You\'ve hit your session limit \\xc2\\xb7 resets 11:50am (UTC)"',
    "exit 1",
  ]);
}

// Fails like main.mts does when its wall-clock ceiling fires: prints the
// sentinel line and exits non-zero. The loop no longer reads that line — it
// is here because this is what a real timed-out run looks like.
function stubCheckpointTimeoutNpx() {
  stubNpx([
    'echo "agent output"',
    'echo "RALPH_CHECKPOINT_TIMEOUT_HIT: run exceeded 90m (5400000ms)"',
    "exit 1",
  ]);
}

function sleepCallLogPath() {
  return path.join(repoDir, "sleep-calls.log");
}

function readSleepCalls(): string[] {
  try {
    return readFileSync(sleepCallLogPath(), "utf-8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function readCallLog(callLogPath: string): string[] {
  try {
    return readFileSync(callLogPath, "utf-8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// Stub `gh` for reap_orphaned_in_progress_issues tests: logs every call,
// and answers `gh issue list ... --label in-progress-by-agent ...` with
// the caller-supplied orphan list (number + label names), same shape
// `gh issue list --json number,labels` returns for real.
function stubGhForReap(orphans: { number: number; labels: string[] }[]): { callLogPath: string } {
  const callLogPath = path.join(repoDir, "gh-calls.log");
  const orphansJson = JSON.stringify(
    orphans.map((o) => ({ number: o.number, labels: o.labels.map((name) => ({ name })) }))
  );
  writeFileSync(
    path.join(stubBinDir, "gh"),
    [
      "#!/usr/bin/env bash",
      `echo "$@" >> "${callLogPath}"`,
      'if [[ "$1 $2" == "issue list" ]]; then',
      `  cat <<'REAP_EOF'`,
      orphansJson,
      "REAP_EOF",
      "fi",
      "exit 0",
    ].join("\n")
  );
  execFileSync("chmod", ["+x", path.join(stubBinDir, "gh")]);
  return { callLogPath };
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

  // The loop backs off after a failure and sleeps when nothing is workable.
  // Log the durations instead of waiting them out.
  writeFileSync(
    path.join(stubBinDir, "sleep"),
    ["#!/usr/bin/env bash", `echo "$@" >> "${sleepCallLogPath()}"`, "exit 0"].join("\n")
  );
  execFileSync("chmod", ["+x", path.join(stubBinDir, "sleep")]);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(stubBinDir, { recursive: true, force: true });
});

describe("run_build_iteration writes no notes of its own (#147)", () => {
  // The loop-written note said only that a retry had happened, and existed
  // to be evidence for a detector comparing it against a counter label. Both
  // are gone. The agent's own checkpoint notes, written inside the sandbox,
  // remain the resume mechanism.
  it("commits no note and touches no counter label on a session-limit failure", () => {
    stubSessionLimitNpx();
    const { callLogPath } = stubGhWithCallLog([]);
    git(["branch", "ralph/issue-55"]);

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 55, title: "Test issue", body: "body" }));

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    expect(git(["log", "--all", "--format=%s"])).not.toContain("Progress notes");

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.includes("session-limit-seen"))).toBe(false);
    expect(calls.some((c) => c.includes("blocked-for-agent"))).toBe(false);
    // The issue stays ready-for-agent, so the next sweep retries it.
    expect(calls).toContain(
      "issue edit 55 --repo rpbaptist/belastingaangifte-check --remove-label in-progress-by-agent"
    );
  });

  it("commits no note on a checkpoint-timeout failure either", () => {
    stubCheckpointTimeoutNpx();
    const { callLogPath } = stubGhWithCallLog([]);
    git(["branch", "ralph/issue-71"]);

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 71, title: "Test issue", body: "body" }));

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    expect(git(["log", "--all", "--format=%s"])).not.toContain("Progress notes");

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.includes("session-limit-seen"))).toBe(false);
    expect(calls.some((c) => c.includes("blocked-for-agent"))).toBe(false);
  });
});

// Stub `gh` so `gh issue list --label ready-for-agent --json ...` answers with
// the caller's candidates, in the shape pick_issue parses. Everything else is
// a silent no-op, so an issue's blockers read as closed.
function stubGhWithCandidates(issues: { number: number; title: string; body: string }[]) {
  const candidatesJson = JSON.stringify(issues.map((i) => ({ ...i, labels: [] })));
  writeFileSync(
    path.join(stubBinDir, "gh"),
    [
      "#!/usr/bin/env bash",
      'if [[ "$1 $2" == "issue list" ]]; then',
      "  cat <<'LIST_EOF'",
      candidatesJson,
      "LIST_EOF",
      "fi",
      "exit 0",
    ].join("\n")
  );
  execFileSync("chmod", ["+x", path.join(stubBinDir, "gh")]);
}

describe("failure handling without classification (#148)", () => {
  // The loop no longer asks why a run failed. Log-grepping classification was
  // wrong for a quarter of recorded runs — those logs hold only a pointer to
  // the real log — and every branch it chose between ended in "try again".
  it("keeps ready-for-agent and sets the issue aside instead of blocking it", () => {
    stubNpx(['echo "some unrelated agent error"', "exit 1"]);
    const { callLogPath } = stubGhWithCallLog(["ready-for-agent"]);

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 90, title: "Test issue", body: "body" }));

    const output = runLoopFn(
      `run_build_iteration "$(cat '${issueJsonPath}')"; issue_set_aside 90 && echo SET_ASIDE`
    );

    expect(output).toContain("SET_ASIDE");

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.includes("blocked-for-agent"))).toBe(false);
    expect(calls.some((c) => c.includes("--remove-label ready-for-agent"))).toBe(false);
    expect(calls).toContain(
      "issue edit 90 --repo rpbaptist/belastingaangifte-check --remove-label in-progress-by-agent"
    );
  });

  it("backs off after a failure", () => {
    stubNpx(['echo "some unrelated agent error"', "exit 1"]);
    stubGhWithCallLog([]);

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 92, title: "Test issue", body: "body" }));

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    expect(readSleepCalls()).toEqual(["60"]);
  });

  // A session limit is 15 of 37 recorded failures and is account-global, not
  // issue-specific. It gets no special path: the same set-aside and backoff
  // apply, and the limit resets while the loop sleeps between sweeps.
  it("treats a session limit like any other failure", () => {
    stubSessionLimitNpx();
    const { callLogPath } = stubGhWithCallLog([]);

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 93, title: "Test issue", body: "body" }));

    const output = runLoopFn(
      `run_build_iteration "$(cat '${issueJsonPath}')"; issue_set_aside 93 && echo SET_ASIDE`
    );

    expect(output).toContain("SET_ASIDE");
    // Not the reset time parsed out of the log, which is gone with the
    // classifier: one fixed backoff, whatever the failure was.
    expect(readSleepCalls()).toEqual(["60"]);
    expect(readCallLog(callLogPath).some((c) => c.includes("blocked-for-agent"))).toBe(false);
  });
});

describe("pick_issue and the set-aside list (#148)", () => {
  it("skips an issue set aside earlier in this sweep", () => {
    stubGhWithCandidates([
      { number: 10, title: "First", body: "no blockers" },
      { number: 11, title: "Second", body: "no blockers" },
    ]);

    const picked = runLoopFn(`set_aside_issue 10; pick_issue`);

    expect(JSON.parse(picked.trim()).number).toBe(11);
  });

  it("picks the set-aside issue again once a new sweep starts", () => {
    stubGhWithCandidates([{ number: 10, title: "First", body: "no blockers" }]);

    const skipped = runLoopFn(`set_aside_issue 10; pick_issue`);
    expect(skipped.trim()).toBe("");

    const picked = runLoopFn(`set_aside_issue 10; start_new_sweep; pick_issue`);
    expect(JSON.parse(picked.trim()).number).toBe(10);
  });
});

describe("run_build_iteration when main.mts reports needs-human (exit 2)", () => {
  it("hands the issue to a person rather than clearing it or reporting a crash", () => {
    writeFileSync(
      path.join(stubBinDir, "npx"),
      [
        "#!/usr/bin/env bash",
        'echo "Needs human: ralph/issue-91, PR #200 left open."',
        "exit 2",
      ].join("\n")
    );
    execFileSync("chmod", ["+x", path.join(stubBinDir, "npx")]);

    const { callLogPath } = stubGhWithCallLog(["ready-for-agent"]);

    const issueJson = JSON.stringify({ number: 91, title: "Test issue", body: "body" });
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, issueJson);

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    const calls = readCallLog(callLogPath);
    const editCall = calls.find(
      (c) => c.startsWith("issue edit 91") && c.includes("ready-for-human")
    );
    // Exit 2 means the work landed but the PR is parked — CI red, merge
    // rejected, or findings outstanding. Clearing ready-for-agent stops the
    // loop re-picking finished work; blocked-for-agent would wrongly report a
    // crash, which is what used to happen before main.mts had a third outcome.
    expect(editCall).toContain("--add-label ready-for-human");
    expect(editCall).toContain("--remove-label ready-for-agent");
    expect(calls.some((c) => c.includes("blocked-for-agent"))).toBe(false);
  });
});

describe("reap_orphaned_in_progress_issues (#137)", () => {
  it("does nothing when no issue is labeled in-progress-by-agent", () => {
    const { callLogPath } = stubGhForReap([]);

    runLoopFn("reap_orphaned_in_progress_issues");

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.startsWith("issue edit"))).toBe(false);
    expect(calls.some((c) => c.startsWith("issue comment"))).toBe(false);
  });

  it("recovers a first-time orphan to ready-for-agent and marks hard-kill-seen", () => {
    const { callLogPath } = stubGhForReap([{ number: 114, labels: ["in-progress-by-agent"] }]);

    runLoopFn("reap_orphaned_in_progress_issues");

    const calls = readCallLog(callLogPath);
    const editCall = calls.find((c) => c.startsWith("issue edit 114"));
    expect(editCall).toContain("--remove-label in-progress-by-agent");
    expect(editCall).toContain("--add-label hard-kill-seen");
    expect(editCall).toContain("--add-label ready-for-agent");
    expect(editCall).not.toContain("blocked-for-agent");
    expect(calls.some((c) => c.startsWith("issue comment 114"))).toBe(true);
  });

  it("escalates a second consecutive orphan to blocked-for-agent", () => {
    const { callLogPath } = stubGhForReap([
      { number: 115, labels: ["in-progress-by-agent", "hard-kill-seen"] },
    ]);

    runLoopFn("reap_orphaned_in_progress_issues");

    const calls = readCallLog(callLogPath);
    const editCall = calls.find((c) => c.startsWith("issue edit 115"));
    expect(editCall).toContain("--remove-label in-progress-by-agent");
    expect(editCall).toContain("--remove-label hard-kill-seen");
    expect(editCall).toContain("--add-label blocked-for-agent");
    expect(editCall).not.toContain("--add-label ready-for-agent");
    expect(calls.some((c) => c.startsWith("issue comment 115"))).toBe(true);
  });

  it("handles multiple orphaned issues found at once", () => {
    const { callLogPath } = stubGhForReap([
      { number: 200, labels: ["in-progress-by-agent"] },
      { number: 201, labels: ["in-progress-by-agent", "hard-kill-seen"] },
    ]);

    runLoopFn("reap_orphaned_in_progress_issues");

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.startsWith("issue edit 200") && c.includes("ready-for-agent"))).toBe(
      true
    );
    expect(
      calls.some((c) => c.startsWith("issue edit 201") && c.includes("blocked-for-agent"))
    ).toBe(true);
  });
});

describe("run_build_iteration on success", () => {
  it("success path clears hard-kill-seen alongside the other labels (#137)", () => {
    writeFileSync(
      path.join(stubBinDir, "npx"),
      ["#!/usr/bin/env bash", 'echo "sandbox succeeded"', "exit 0"].join("\n")
    );
    execFileSync("chmod", ["+x", path.join(stubBinDir, "npx")]);

    const { callLogPath } = stubGhWithCallLog(["hard-kill-seen"]);

    const issueJson = JSON.stringify({ number: 116, title: "Test issue", body: "body" });
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, issueJson);

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    const calls = readCallLog(callLogPath);
    expect(
      calls.some(
        (c) => c.includes("--remove-label hard-kill-seen") && c.startsWith("issue edit 116")
      )
    ).toBe(true);
  });
});
