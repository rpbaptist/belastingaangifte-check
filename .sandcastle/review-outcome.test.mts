import { describe, it, expect } from "vitest";
import { reviewOutcome } from "./review-outcome.mts";

describe("reviewOutcome", () => {
  it("reports merged only when the merge actually happened", () => {
    expect(reviewOutcome(true)).toBe("merged");
  });

  // The bug this exists to prevent: mergeAndCleanUp returns early when CI
  // stays red, when the merge is rejected, and when review findings are
  // outstanding. main.mts used to print "Success" and exit 0 regardless. The
  // loop then cleared ready-for-agent and the issue left the queue while its
  // PR sat open and failing, with nobody told.
  it("reports needs-human when the merge did not happen", () => {
    expect(reviewOutcome(false)).toBe("needs-human");
  });
});
