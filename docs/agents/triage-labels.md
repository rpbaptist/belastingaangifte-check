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

Three additional labels, specific to the unattended RALPH loop (`loop.sh` +
`.sandcastle/`), sit downstream of `ready-for-agent`. They are not part of
the five-role vocabulary above and are never applied by a human during
triage — only by the loop itself.

| Label                  | Meaning                                                                    |
| ---------------------- | --------------------------------------------------------------------------- |
| `blocked`               | A `## Blocked by` issue is still open; not actually ready yet             |
| `in-progress-by-agent` | The loop has claimed this issue and is actively working it in a sandbox   |
| `blocked-for-agent`    | A loop iteration failed; needs human inspection before retrying           |

State machine: at the top of every iteration the loop re-checks every
`blocked` issue's `## Blocked by` list and promotes it back to
`ready-for-agent` (with a comment) the moment all of them are closed — see
`promote_unblocked_issues` in `loop.sh`. Then, before claiming a candidate,
`pick_issue` checks that issue's own `## Blocked by` list; if anything on it
is still open, the issue is relabeled `blocked` (with a comment naming the
open blockers) instead of being claimed, and the picker moves to the next
candidate. Only once an issue clears that gate does it proceed:
`ready-for-agent` → (loop claims it) `in-progress-by-agent` → either the
label is cleared and a PR is opened (success), or it becomes
`blocked-for-agent` (failure — human must clear it before the loop will
touch the issue again). The picker always excludes `in-progress-by-agent`
and `blocked-for-agent`, so an issue carrying either is never re-claimed
automatically — same for `blocked`, which only the promotion check above
can clear.
