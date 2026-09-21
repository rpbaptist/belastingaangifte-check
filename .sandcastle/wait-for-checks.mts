import { execFileSync } from "node:child_process";

// Waits for GitHub to attach the CI check to a pull request's head commit,
// so the merge gate has something to watch. Kept apart from review-lib.mts so
// it can be tested without Docker, like pr-resolution.mts.

// The job name in .github/workflows/ci.yml. master has no branch protection,
// so this check is the only thing that stops a red PR from merging.
const CI_CHECK_NAME = "ci";

export interface CheckLookup {
  // Names of the checks reported on the PR's head commit. Throws when there
  // are none: gh exits 1 with "no checks reported".
  checkNames(prNumber: string): string[];
  sleep(ms: number): Promise<void>;
}

const gitHubLookup: CheckLookup = {
  checkNames(prNumber) {
    const checks = JSON.parse(
      execFileSync("gh", ["pr", "checks", prNumber, "--json", "name"], { encoding: "utf-8" })
    ) as { name: string }[];
    return checks.map((c) => c.name);
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Returns whether the CI check appeared before the timeout. A failed lookup
// counts as "not yet": straight after a push that is the normal answer.
export async function waitForCiCheck(
  prNumber: string,
  lookup: CheckLookup = gitHubLookup,
  { timeoutMs = 3 * 60 * 1000, intervalMs = 10 * 1000 } = {}
): Promise<boolean> {
  for (let waited = 0; ; waited += intervalMs) {
    let names: string[] = [];
    try {
      names = lookup.checkNames(prNumber);
    } catch {
      // No checks reported yet.
    }
    if (names.includes(CI_CHECK_NAME)) return true;
    if (waited >= timeoutMs) return false;
    await lookup.sleep(intervalMs);
  }
}
