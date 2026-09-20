# ADR 0011: RALPH loop — three build-harness outcomes, not two

`main.mts` used to tell `loop.sh` one of two things: exit 0 for success, non-zero
for failure. That is not enough information, because the review pass has a third
result it cannot express.

`runReview` returns without merging whenever the PR is deliberately parked:
CI stayed red after `MAX_CI_FIX_ATTEMPTS` fix passes, the squash merge was
rejected, or the review left findings that want follow-up. In every one of those
cases `mergeAndCleanUp` returned early, `runReview` returned normally, and
`main.mts` printed `Success:` and exited 0. `loop.sh` then cleared
`ready-for-agent` and the issue left the queue while its pull request sat open
and failing. Nobody was told. Observed on #118, whose PR #139 was reported as
"built and reviewed" with `ci fail` in the same log.

The loop cannot infer the difference. From outside the process, a merged PR and
a parked PR both look like exit 0.

## Considered options

- **Keep two outcomes and have the loop inspect the PR afterwards.** Rejected:
  the loop would have to re-query `gh` for merge state and check status, which
  is both a second source of truth and more of the log/state scraping this area
  is being cleaned up to remove. The harness already knows the answer.
- **Keep two outcomes and treat a parked PR as failure (exit 1).** Rejected: the
  work succeeded. Reporting it as a failure puts the issue on the retry path,
  and a retry cannot improve a PR that is waiting on a human decision.
- **Add a third outcome, carried by exit code.** Chosen. `runReview` returns
  `ReviewOutcome` (`"merged" | "needs-human"`), and `main.mts` maps it to exit 0
  and exit 2 respectively. Exit 1 keeps its existing meaning of a genuine
  failure. The loop branches on the code: 0 clears the issue, 2 relabels it
  `ready-for-human`, anything else is a failure.

`ready-for-human` is reused from the canonical five-role triage vocabulary
rather than adding a loop-owned label. `blocked-for-agent` was rejected for this
case: it means "a loop iteration failed", which misdescribes a finished PR
awaiting a person, and it would make the two situations indistinguishable on the
board.

## Consequences

- The loop reads `PIPESTATUS[0]`, not `$?`, because the harness runs through
  `tee` and `$?` is always tee's status.
- The decision lives in one pure function, `reviewOutcome` in its own module, so
  it is unit-testable without importing the review module's Docker and sandbox
  dependencies — the same split already used for `classify-run-error.mts`.
- Any future early return from `mergeAndCleanUp` must yield `"needs-human"`.
  Returning `void` from a path that leaves the PR open is the exact bug this
  ADR exists to prevent.
- `review.mts` (the manual review-only entrypoint) ignores the return value. It
  is run by a person who can see the result, so it has no exit-code contract to
  honour.
