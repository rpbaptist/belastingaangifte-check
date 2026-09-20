// What the build harness tells loop.sh once a review pass is done. Kept in
// its own module (like classify-run-error.mts) so it is unit-testable without
// importing review-lib.mts's sandbox and Docker dependencies.
export type ReviewOutcome = "merged" | "needs-human";

// The rule this exists to hold: a PR that did not merge is never a success,
// whatever the reason. review-lib's merge step returns early when CI stays red
// or the merge is rejected, and reporting success for a PR parked that way is
// what let finished-looking issues leave the queue with an open, failing PR
// behind them.
export function reviewOutcome(merged: boolean): ReviewOutcome {
  return merged ? "merged" : "needs-human";
}
