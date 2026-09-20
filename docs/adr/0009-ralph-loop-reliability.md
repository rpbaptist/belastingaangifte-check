# ADR 0009: RALPH loop reliability — local progress notes, GitHub as the durable backstop

> **Superseded by [ADR 0012](0012-ralph-loop-drops-state-loss-detection.md).** The
> loop no longer writes progress notes, and the state-loss detector and its
> `session-limit-seen` label are removed.

The unattended RALPH loop (`loop.sh` + `.sandcastle/`) retries an issue across Claude
session-limit resets. A retry that re-explores the codebase from scratch every time
burns a full session budget on rediscovery instead of finishing the issue (#106
stalled this way across four attempts). #119 fixed the common case: on a
session-limit exit, `loop.sh` itself (not the agent, which does not survive the kill)
writes a minimal progress note directly onto `ralph/issue-N` via git plumbing, so the
next attempt's prompt can find prior context and skip re-exploring.

That note only updates a local git ref — it is never pushed to origin. This is
deliberate, not an oversight: `main.mts`'s push gate already refuses to push a branch
whose only commits are progress notes (real work must exist before a PR opens), so
pushing a note-only branch would just be rejected work. But it means the note does
not survive the RALPH host's local state being lost — a restart, a redeploy, a disk
reset, or someone deleting the branch. After that, a second session-limit hit for the
same issue looks identical to a first-ever hit: `loop.sh` has no local evidence
either way, and would just keep retrying forever with no signal to a human that
anything is wrong.

We considered making the counter itself local (a state file, or counting
`ralph-logs/*.log` files matching the session-limit message) but rejected it: local
disk is exactly what a host reset destroys, so a local counter fails in precisely the
scenario it exists to catch — it can't distinguish "first hit" from "second hit,
state lost" any better than the git ref it would be checking instead.

## Considered options

- **Local counter (state file or log-file count).** Rejected: `ralph-logs/` is
  `.gitignore`d and lives on the same local disk as the git ref; a host reset takes
  both out together, so this counter is exactly as fragile as the thing it checks.
- **GitHub label (`session-limit-seen`) as the durable signal, cross-checked against
  the local progress-note commit count.** Chosen. The label survives host loss because
  it isn't stored on the host. Added on an issue's first session-limit hit; on a
  second hit, if the label is present but `git log --grep="Progress notes: issue #N"
master..ralph/issue-N` is empty, that mismatch is exactly the state-loss signature —
  `loop.sh` relabels `blocked-for-agent` and stops retrying instead of spinning
  blind. Cleared again on success so a later reopen starts clean.
- **Push the progress note to origin instead of keeping it local-only.** Rejected:
  contradicts `main.mts`'s existing push gate (would need special-casing a note-only
  push), and moves durable-state responsibility onto a second system (origin refs)
  instead of the one already used for issue state (GitHub labels/comments).

## Consequences

- Progress notes stay local-only and cheap to write (no push, no PR-gate
  interaction) — #119's design is unchanged.
- Detecting state loss costs one extra `gh issue view` per session-limit hit, to read
  the current label set rather than trust whatever `pick_issue` captured before a
  long-running sandbox attempt.
- `session-limit-seen` is a fifth loop-owned label (see
  `docs/agents/triage-labels.md`); it never appears in the five-role human triage
  vocabulary and is only ever applied/cleared by `loop.sh` itself.
- The anomaly path deliberately does not try to reconstruct what was lost — it only
  detects and flags. Recovery is a human decision (re-label `ready-for-agent` to
  retry from scratch, or investigate further).
