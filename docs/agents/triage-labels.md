# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## `ready-for-agent` only applies to `to-tickets` output

Never apply `ready-for-agent` to a spec or epic issue directly. It only
belongs on the small, independently-gradable vertical slices that come out
of running `to-tickets` against a spec — those are the only issues sized for
a single unattended agent pass. A spec/epic issue stays `needs-triage` (or
gets `to-tickets` run on it to produce the real `ready-for-agent` issues)
until it has been broken down.

Also confirm any issues named in a `## Blocked by` section are merged or
closed before applying `ready-for-agent` — an issue whose stated blocker
still has an open, unmerged PR is not actually ready, regardless of what
`to-tickets` originally scoped it as. `to-tickets` output must always
include a `## Blocked by` section (even if empty), formatted as
`- #NNN (reason)` bullets — `loop.sh` parses this exact format (see below)
to enforce the rule automatically; a differently-shaped section won't be
read by the gate and the issue will be claimed regardless of open blockers.

## RALPH-loop labels

Five additional labels, specific to the unattended RALPH loop (`loop.sh` +
`.sandcastle/`), sit downstream of `ready-for-agent`. They are not part of
the five-role vocabulary above and are never applied by a human during
triage — only by the loop itself.

| Label                  | Meaning                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `blocked`              | A `## Blocked by` issue is still open; not actually ready yet           |
| `in-progress-by-agent` | The loop has claimed this issue and is actively working it in a sandbox |
| `blocked-for-agent`    | Legacy: a loop iteration failed. Only startup reaping still applies it  |
| `hard-kill-seen`       | This issue already survived one hard-killed sandbox run                 |

The loop also applies `ready-for-human` — from the five-role vocabulary above,
not a loop-owned label. It means the agent finished and pushed, but the pull
request is parked: CI stayed red after the automated fix attempts, the merge was
rejected, or review findings are outstanding. `main.mts` signals this by exiting
2, distinct from exit 0 (merged) and exit 1 (failed); see ADR 0011. It is the
loop's only handoff to a person: a failed iteration is retried rather than
labelled.

A failed iteration is no longer classified at all. The loop used to grep the
run's log to decide whether the failure was transient, and to label
`blocked-for-agent` when it could not tell — which it could not for the quarter
of runs whose log holds only a pointer to the real log. Now every failure is
handled identically: the issue keeps `ready-for-agent`, is set aside for the
rest of the sweep so it cannot starve the queue, and is retried on the next
sweep. Nothing durable records the failure.

A session-limit hit is no longer counted on the issue. The loop used to add a
`session-limit-seen` label and write a progress-note commit on `ralph/issue-N`,
then compare the two to guess whether host state had been lost between
attempts. The note carried no information beyond "a retry happened", so the
detector was machinery guarding machinery; both are gone, and a session limit
is simply retried. See ADR 0012, which supersedes ADR 0009.

`hard-kill-seen` guards against the same "retry forever" failure mode for
a different cause: a sandbox run that gets hard-killed (container OOM,
host process killed, terminal closed) instead of exiting normally leaves
`in-progress-by-agent` on the issue with nothing left to clear it, since
the `loop.sh` process that would have run that cleanup is what died. At
startup, before the main loop begins, `reap_orphaned_in_progress_issues`
treats any issue still labeled `in-progress-by-agent` as proof of exactly
that — `loop.sh` only ever holds one issue in progress at a time, in a
single synchronous process, so a fresh process finding the label already
set means the prior run never got to clear it. The first time this
happens for an issue, it's relabeled `ready-for-agent` and marked
`hard-kill-seen` (auto-retry, same trust level as a checkpoint-timeout
retry). If the same issue is found orphaned _again_ on a later startup
(`hard-kill-seen` already present), the loop escalates it to
`blocked-for-agent` instead of retrying blind a second time. The label is
cleared once the issue succeeds.

State machine: at the top of every iteration the loop re-checks every
`blocked` issue's `## Blocked by` list and promotes it back to
`ready-for-agent` (with a comment) the moment all of them are closed — see
`promote_unblocked_issues` in `loop.sh`. Then, before claiming a candidate,
`pick_issue` checks that issue's own `## Blocked by` list; if anything on it
is still open, the issue is relabeled `blocked` (with a comment naming the
open blockers) instead of being claimed, and the picker moves to the next
candidate. Only once an issue clears that gate does it proceed:
`ready-for-agent` → (loop claims it) `in-progress-by-agent` → one of three
ends, keyed off `main.mts`'s exit code (ADR 0011): the labels are cleared
because the PR merged (exit 0, success); the issue becomes
`ready-for-human` because the PR is open but parked on red CI, a rejected
merge, or outstanding findings (exit 2); or the iteration failed (exit 1), in
which case only `in-progress-by-agent` comes off and the issue waits for the
next sweep. The picker always excludes `in-progress-by-agent` and
`blocked-for-agent`, so an issue carrying either is never re-claimed
automatically — same for `blocked`, which only the promotion check above
can clear.

When nothing is workable the loop does not exit. It sleeps for 30 minutes,
clears the set-aside list and looks again, so a session limit, a closing
blocker or a newly queued issue is picked up without anyone restarting it. A
run given an iteration cap (`./loop.sh 1`) stops instead of sleeping, because
a capped run is a test run.
