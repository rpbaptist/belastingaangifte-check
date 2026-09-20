# ADR 0012: RALPH loop — drop loop-written progress notes and state-loss detection

Supersedes [ADR 0009](0009-ralph-loop-reliability.md).

ADR 0009 chose a durable GitHub label (`session-limit-seen`) cross-checked against a
local progress-note commit on `ralph/issue-N`, so that a repeated session-limit hit
with no surviving note could be recognised as lost host state and flagged for a human
instead of retried forever. `loop.sh` wrote that note itself, via git plumbing, on
every transient failure.

The mechanism is removed. `loop.sh` no longer writes notes, no longer reads the
counter label, and no longer has a state-loss detector.

## Why the decision is reversed

The note it depended on carried no information. Its own text said so — "this note only
confirms a session-limit retry happened" — because the process that knew anything
useful, the agent, was already dead by the time the note was written. So the note's
only purpose was to be evidence for the detector, and the detector's only purpose was
to interpret the note. That is machinery guarding machinery, and it is 120 lines of
`loop.sh` plus a label, a comment template and two escalation paths.

The demand for it also shrank. ADR 0009 was written when a retry could not reliably
succeed: PR creation failed deterministically for any issue whose branch already had
an open pull request (#150), and the sandbox contended with the host over a shared git
config file (#145). Both causes are fixed, so repetition is now a working recovery
strategy rather than a way to burn budget. Bounded retries mattered most when retries
could not work.

The agent's own checkpoint notes are unaffected and are the resume mechanism. They are
written inside the sandbox during a run, hold real current-best state, and land on the
same branch under the same `Progress notes: issue #N` subject. `main.mts` still refuses
to open a pull request for a branch that holds nothing but those notes.

## Consequences

- Retry bounding is now in-process only, and deliberately weaker: a failed issue is
  set aside for the rest of a sweep and retried on the next one. Nothing on GitHub
  counts how many times an issue has failed.
- Lost host state is no longer detected. An issue whose local branch disappears is
  re-attempted from scratch, which costs a session's exploration but needs no human.
  That trade is accepted; the detector's own recovery advice was "a human decides".
- `session-limit-seen` is gone from `loop.sh` and from
  `docs/agents/triage-labels.md`. Existing issues may still carry it; it is inert.
- If bounded retries are wanted again, the intended approach is counting the loop's
  own failure comments on the issue, not reintroducing a counter label and a local
  artefact to compare it against.
