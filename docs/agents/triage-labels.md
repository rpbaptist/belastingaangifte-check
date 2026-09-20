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

## What the RALPH loop reads and writes

The RALPH loop (`loop.sh` + `.sandcastle/`) owns no labels of its own. It
reads `ready-for-agent` and writes `ready-for-human`, both from the five-role
vocabulary above, and that is its entire durable state.

`ready-for-human` means the agent finished and pushed, but the pull request is
parked: CI stayed red after the automated fix attempts, the merge was
rejected, or review findings are outstanding. `main.mts` signals this by
exiting 2, distinct from exit 0 (merged) and exit 1 (failed); see ADR 0011. It
is the loop's only handoff to a person.

A failed iteration is not labelled at all. The loop used to grep the run's log
to decide whether a failure was transient, and to label `blocked-for-agent`
when it could not tell — which it could not for the quarter of runs whose log
holds only a pointer to the real log. Now every failure is handled
identically: the issue keeps `ready-for-agent`, is set aside for the rest of
the sweep so it cannot starve the queue, and is retried on the next sweep.
Nothing durable records the failure.

A session-limit hit is not counted on the issue either. The loop used to add a
`session-limit-seen` label and write a progress-note commit on
`ralph/issue-N`, then compare the two to guess whether host state had been
lost between attempts. The note carried no information beyond "a retry
happened", so the detector was machinery guarding machinery; both are gone,
and a session limit is simply retried. See ADR 0012, which supersedes ADR 0009.

An issue with open blockers is skipped silently. Selection parses the
`## Blocked by` section and re-checks each blocker's state on every pass, so
the issue becomes workable again on its own the moment they close — with no
`blocked` label to flip and no comment traffic in either direction.

There is also no in-progress label. The loop works one issue at a time in a
single synchronous process, so the label only ever restated what the process
already knew, and it left orphaned state behind whenever the process was
killed. Without it there is nothing to reconcile: killing the loop mid-run and
restarting it is safe by construction, and needs no recovery pass at startup.

Retired labels, for anyone who meets one on an old issue: `blocked`,
`in-progress-by-agent`, `blocked-for-agent`, `session-limit-seen` and
`hard-kill-seen`. The loop neither writes nor reads them. They are inert
wherever they remain.

State machine, in full: `ready-for-agent` → (loop picks it, if no blocker is
open and it has not already failed this sweep) → one of three ends, keyed off
`main.mts`'s exit code (ADR 0011). The PR merged (exit 0), and
`ready-for-agent` comes off. The PR is open but parked on red CI, a rejected
merge, or outstanding findings (exit 2), and the issue becomes
`ready-for-human`. Or the iteration failed (exit 1), and nothing on the
tracker changes — the issue waits for the next sweep.

When nothing is workable the loop does not exit. It sleeps for 30 minutes,
clears the set-aside list and looks again, so a session limit, a closing
blocker or a newly queued issue is picked up without anyone restarting it. A
run given an iteration cap (`./loop.sh 1`) stops instead of sleeping, because
a capped run is a test run.
