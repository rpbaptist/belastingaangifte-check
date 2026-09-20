import { describe, it, expect } from "vitest";
import { reviewOutcome } from "./review-outcome.mts";

describe("reviewOutcome", () => {
  it("reports merged only when the merge actually happened", () => {
    expect(reviewOutcome({ hasFindings: false, merged: true })).toBe("merged");
  });

  // The bug this exists to prevent: mergeAndCleanUp returns early when CI
  // stays red or the merge is rejected, and main.mts used to print "Success"
  // and exit 0 anyway. The loop then cleared ready-for-agent and the issue
  // left the queue while its PR sat open and failing, with nobody told.
  it("reports needs-human when the merge did not happen", () => {
    expect(reviewOutcome({ hasFindings: false, merged: false })).toBe("needs-human");
  });

  // Findings mean the review wants follow-up before the PR can land, so the
  // merge is never attempted — the outcome must not depend on the merge flag.
  it("reports needs-human whenever review left findings", () => {
    expect(reviewOutcome({ hasFindings: true, merged: false })).toBe("needs-human");
    expect(reviewOutcome({ hasFindings: true, merged: true })).toBe("needs-human");
  });
});
