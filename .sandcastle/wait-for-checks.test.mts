import { describe, it, expect, vi } from "vitest";
import { waitForCiCheck, type CheckLookup } from "./wait-for-checks.mts";

// Right after a push, GitHub has not yet attached any checks to the new head
// commit, and `gh pr checks --watch` exits 1 with "no checks reported". The
// merge gate read that as a CI failure and left the PR for a human.

function lookupAnswering(...answers: (string[] | Error)[]): CheckLookup {
  let call = 0;
  return {
    checkNames: vi.fn(() => {
      const answer = answers[Math.min(call++, answers.length - 1)]!;
      if (answer instanceof Error) throw answer;
      return answer;
    }),
    sleep: vi.fn(async () => {}),
  };
}

const options = { timeoutMs: 60_000, intervalMs: 5_000 };

describe("waitForCiCheck", () => {
  it("returns at once when the ci check is already reported", async () => {
    const lookup = lookupAnswering(["Vercel", "ci"]);

    expect(await waitForCiCheck("7", lookup, options)).toBe(true);
    expect(lookup.sleep).not.toHaveBeenCalled();
  });

  it("waits until the ci check appears", async () => {
    const lookup = lookupAnswering([], [], ["ci"]);

    expect(await waitForCiCheck("7", lookup, options)).toBe(true);
    expect(lookup.sleep).toHaveBeenCalledTimes(2);
  });

  // Vercel reports its checks before GitHub Actions does. Watching then would
  // see only Vercel's checks pass, and merge before CI has even started.
  it("keeps waiting while only other checks are reported", async () => {
    const lookup = lookupAnswering(["Vercel"], ["Vercel", "ci"]);

    expect(await waitForCiCheck("7", lookup, options)).toBe(true);
    expect(lookup.sleep).toHaveBeenCalledTimes(1);
  });

  it("treats a failed lookup as no checks yet", async () => {
    const lookup = lookupAnswering(new Error("no checks reported"), ["ci"]);

    expect(await waitForCiCheck("7", lookup, options)).toBe(true);
  });

  it("gives up after the timeout", async () => {
    const lookup = lookupAnswering([]);

    expect(await waitForCiCheck("7", lookup, options)).toBe(false);
    expect(lookup.sleep).toHaveBeenCalledTimes(12);
  });
});
