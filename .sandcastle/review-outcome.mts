// What the build harness tells loop.sh once a review pass is done. Kept in
// its own module (like classify-run-error.mts) so it is unit-testable without
// importing review-lib.mts's sandbox and Docker dependencies.
export type ReviewOutcome = "merged" | "needs-human";

// The single place that decides what the loop is told. Any path that leaves
// the PR open must map to "needs-human": review-lib's merge step returns
// early when CI stays red or the merge is rejected, and reporting success for
// a PR parked that way is what let finished-looking issues leave the queue
// with an open, failing PR behind them.
export function reviewOutcome(args: {
  readonly hasFindings: boolean;
  readonly merged: boolean;
}): ReviewOutcome {
  if (args.hasFindings) return "needs-human";
  return args.merged ? "merged" : "needs-human";
}
