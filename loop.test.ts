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
// line per call) to a file the test can assert against — everything else is
// a silent no-op, same as the default stub.
function stubGhWithCallLog(): { callLogPath: string } {
  const callLogPath = path.join(repoDir, "gh-calls.log");
  writeFileSync(
    path.join(stubBinDir, "gh"),
    ["#!/usr/bin/env bash", `echo "$@" >> "${callLogPath}"`, "exit 0"].join("\n")
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
    const { callLogPath } = stubGhWithCallLog();
    git(["branch", "ralph/issue-55"]);

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 55, title: "Test issue", body: "body" }));

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    expect(git(["log", "--all", "--format=%s"])).not.toContain("Progress notes");

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.includes("session-limit-seen"))).toBe(false);
    expect(calls.some((c) => c.includes("blocked-for-agent"))).toBe(false);
  });

  it("commits no note on a checkpoint-timeout failure either", () => {
    stubCheckpointTimeoutNpx();
    const { callLogPath } = stubGhWithCallLog();
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
// the caller's candidates, in the shape pick_issue parses, and every blocker
// looked up answers OPEN. Tests that want a closed or unreadable blocker
// rewrite that one line.
function stubGhWithCandidates(issues: { number: number; title: string; body: string }[]): {
  callLogPath: string;
} {
  const callLogPath = path.join(repoDir, "gh-calls.log");
  const candidatesJson = JSON.stringify(issues.map((i) => ({ ...i, labels: [] })));
  writeFileSync(
    path.join(stubBinDir, "gh"),
    [
      "#!/usr/bin/env bash",
      `echo "$@" >> "${callLogPath}"`,
      'if [[ "$1 $2" == "issue list" ]]; then',
      "  cat <<'LIST_EOF'",
      candidatesJson,
      "LIST_EOF",
      "fi",
      // Any issue looked up as a blocker answers OPEN, so a "## Blocked by"
      // section in a candidate's body means a real open blocker.
      'if [[ "$1 $2" == "issue view" ]]; then',
      '  echo "OPEN"',
      "fi",
      "exit 0",
    ].join("\n")
  );
  execFileSync("chmod", ["+x", path.join(stubBinDir, "gh")]);
  return { callLogPath };
}

describe("failure handling without classification (#148)", () => {
  // The loop no longer asks why a run failed. Log-grepping classification was
  // wrong for a quarter of recorded runs — those logs hold only a pointer to
  // the real log — and every branch it chose between ended in "try again".
  it("keeps ready-for-agent and sets the issue aside instead of blocking it", () => {
    stubNpx(['echo "some unrelated agent error"', "exit 1"]);
    const { callLogPath } = stubGhWithCallLog();

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 90, title: "Test issue", body: "body" }));

    const output = runLoopFn(
      `run_build_iteration "$(cat '${issueJsonPath}')"; issue_set_aside 90 && echo SET_ASIDE`
    );

    expect(output).toContain("SET_ASIDE");

    // Nothing is written to the tracker at all: the issue is already
    // ready-for-agent, which is exactly the state a retry wants.
    expect(readCallLog(callLogPath)).toEqual([]);
  });

  it("backs off after a failure", () => {
    stubNpx(['echo "some unrelated agent error"', "exit 1"]);
    stubGhWithCallLog();

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
    const { callLogPath } = stubGhWithCallLog();

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

  // The list is a space-padded string matched with a glob, so issue 1 must not
  // stand in for issue 11 or 21.
  it("matches whole issue numbers, not prefixes or suffixes", () => {
    const output = runLoopFn(
      `set_aside_issue 1; issue_set_aside 11 && echo WRONG_11; issue_set_aside 21 && echo WRONG_21; issue_set_aside 1 && echo RIGHT_1`
    );

    expect(output.trim()).toBe("RIGHT_1");
  });

  it("picks the set-aside issue again once a new sweep starts", () => {
    stubGhWithCandidates([{ number: 10, title: "First", body: "no blockers" }]);

    const skipped = runLoopFn(`set_aside_issue 10; pick_issue`);
    expect(skipped.trim()).toBe("");

    const picked = runLoopFn(`set_aside_issue 10; start_new_sweep; pick_issue`);
    expect(JSON.parse(picked.trim()).number).toBe(10);
  });
});

describe("blocked issues in selection (#149)", () => {
  // Selection already computes open blockers, so the loop no longer relabels
  // an issue `blocked` and comments about it, only to undo both once the
  // blocker closes. It skips the issue and says nothing.
  it("skips an issue with an open blocker without writing to the tracker", () => {
    const { callLogPath } = stubGhWithCandidates([
      { number: 10, title: "Blocked", body: "## Blocked by\n\n- #9 (prerequisite)\n" },
      { number: 11, title: "Workable", body: "No blockers here." },
    ]);

    const picked = runLoopFn(`pick_issue`);

    expect(JSON.parse(picked.trim()).number).toBe(11);

    const calls = readCallLog(callLogPath);
    expect(calls.some((c) => c.startsWith("issue edit"))).toBe(false);
    expect(calls.some((c) => c.startsWith("issue comment"))).toBe(false);
  });

  it("treats a blocker whose state cannot be read as still open", () => {
    stubGhWithCandidates([
      { number: 10, title: "Blocked", body: "## Blocked by\n\n- #9 (prerequisite)\n" },
    ]);
    // `gh issue view` fails the way a rate limit or a network blip fails.
    writeFileSync(
      path.join(stubBinDir, "gh"),
      readFileSync(path.join(stubBinDir, "gh"), "utf-8").replace(
        '  echo "OPEN"',
        '  echo "gh: could not reach GitHub" >&2\n  exit 1'
      )
    );

    // Nothing is picked: deferring costs a sweep, whereas claiming an issue
    // whose prerequisite may be unfinished costs a run.
    expect(runLoopFn(`pick_issue`).trim()).toBe("");
  });

  it("picks the issue on its own once the blocker closes", () => {
    // Same issue, same body — only the blocker's state differs, and the stub
    // now reports it closed. Nothing relabels the issue in between.
    const { callLogPath } = stubGhWithCandidates([
      { number: 10, title: "Was blocked", body: "## Blocked by\n\n- #9 (prerequisite)\n" },
    ]);
    writeFileSync(
      path.join(stubBinDir, "gh"),
      readFileSync(path.join(stubBinDir, "gh"), "utf-8").replace('echo "OPEN"', 'echo "CLOSED"')
    );

    const picked = runLoopFn(`pick_issue`);

    expect(JSON.parse(picked.trim()).number).toBe(10);
    expect(readCallLog(callLogPath).some((c) => c.startsWith("issue edit"))).toBe(false);
  });
});

describe("run_build_iteration on success", () => {
  // Two labels, not six: ready-for-agent in, ready-for-human out. A merged
  // issue just loses its input label.
  it("clears ready-for-agent and touches nothing else", () => {
    stubNpx(['echo "sandbox succeeded"', "exit 0"]);
    const { callLogPath } = stubGhWithCallLog();

    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: 63, title: "Test issue", body: "body" }));

    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);

    expect(readCallLog(callLogPath)).toEqual([
      "issue edit 63 --repo rpbaptist/belastingaangifte-check --remove-label ready-for-agent",
    ]);
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

    const { callLogPath } = stubGhWithCallLog();

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

describe("run_build_iteration removes a failed attempt's empty branch", () => {
  // New branches start from origin/master (main.mts fetches it first), and
  // nothing in the loop keeps the host's local master current. A branch with
  // no work of its own therefore has to be measured against origin/master:
  // measured against a stale local master it looks like it holds work, and
  // survives to confuse the next attempt.
  function failOn(n: number) {
    stubSessionLimitNpx();
    stubGhWithCallLog();
    const issueJsonPath = path.join(repoDir, "issue.json");
    writeFileSync(issueJsonPath, JSON.stringify({ number: n, title: "Test issue", body: "body" }));
    runLoopFn(`run_build_iteration "$(cat '${issueJsonPath}')"`);
  }

  function advanceOriginMaster() {
    git(["switch", "-q", "-c", "upstream"]);
    writeFileSync(path.join(repoDir, "merged.txt"), "merged elsewhere\n");
    git(["add", "merged.txt"]);
    git(["commit", "-q", "-m", "Merged on GitHub"]);
    git(["update-ref", "refs/remotes/origin/master", "HEAD"]);
    git(["switch", "-q", "master"]);
  }

  function branchExists(name: string): boolean {
    return git(["branch", "--list", name]).trim() !== "";
  }

  it("deletes a branch identical to origin/master while local master is behind", () => {
    advanceOriginMaster();
    git(["branch", "ralph/issue-60", "origin/master"]);

    failOn(60);

    expect(branchExists("ralph/issue-60")).toBe(false);
  });

  it("keeps a branch that holds work beyond origin/master", () => {
    advanceOriginMaster();
    git(["switch", "-q", "-c", "ralph/issue-61", "origin/master"]);
    writeFileSync(path.join(repoDir, "work.txt"), "real work\n");
    git(["add", "work.txt"]);
    git(["commit", "-q", "-m", "Real work"]);
    git(["switch", "-q", "master"]);

    failOn(61);

    expect(branchExists("ralph/issue-61")).toBe(true);
  });
});
