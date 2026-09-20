#!/usr/bin/env bash
# loop.sh — RALPH loop for belastingaangifte-check.
#
# main.mts (.sandcastle/main.mts) owns sandboxing, branch strategy, commit
# verification, push, and PR creation. loop.sh stays dumb: pick an issue,
# label it, run main.mts, read its exit code, relabel. It never inspects a
# run's output — a failure means "try this one again later", whatever it was.
#
# Usage:
#   ./loop.sh                          # runs until stopped (build: claude)
#   ./loop.sh 20                       # cap at 20 iterations (build: claude)
#   ./loop.sh --agent opencode         # use opencode for build, review stays claude
#   ./loop.sh --agent opencode 20      # cap at 20 iterations, build: opencode

set -euo pipefail

# Without this, Ctrl+C only kills the current subprocess pipeline — bash
# treats that as an ordinary command failure, runs the iteration's failure
# branch, and the outer while loop just continues to the next issue. Make
# an interrupt actually stop the script.
trap 'echo; echo "Interrupted — stopping loop."; exit 130' INT TERM

REPO="rpbaptist/belastingaangifte-check"
LOG_DIR="$(pwd)/ralph-logs"
mkdir -p "$LOG_DIR"

# Build harness: flag-only, default claude. Review stays claude.
AGENT="claude"
MAX_ITER="0"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      if [[ -z "${2:-}" ]]; then echo "Missing value for --agent" >&2; exit 2; fi
      AGENT="$2"
      shift 2
      ;;
    --agent=*)
      AGENT="${1#*=}"
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--agent claude|opencode] [MAX_ITER]"
      echo "  --agent   Build harness for main.mts (default claude)"
      echo "  MAX_ITER  Cap iterations (default 0 = unlimited)"
      echo "  Review always runs via claude."
      exit 0
      ;;
    [0-9]*)
      MAX_ITER="$1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done
case "$AGENT" in
  claude|opencode) ;;
  *)
    echo "Unknown build harness \"$AGENT\" (supported: claude|opencode)" >&2
    exit 2
    ;;
esac

# Issues that failed during this sweep, as a space-padded list of numbers.
# The loop never asks why a run failed: the issue is set aside here, the loop
# backs off and moves on, and start_new_sweep clears the list so the issue is
# retried later. Nothing about a failure is recorded anywhere durable, so a
# fresh loop.sh process starts with a clean slate by construction.
SET_ASIDE_ISSUES=" "

# Seconds to wait after a failed iteration, and seconds to sleep when nothing
# is workable. The idle sleep is what makes a Claude session limit
# self-resolving: the limit resets while the loop waits, and no code here
# knows that session limits exist. Overridable for tests.
FAILURE_BACKOFF_SECS="${RALPH_FAILURE_BACKOFF_SECS:-60}"
IDLE_SLEEP_SECS="${RALPH_IDLE_SLEEP_SECS:-1800}"

set_aside_issue() {
  SET_ASIDE_ISSUES="${SET_ASIDE_ISSUES}${1} "
}

issue_set_aside() {
  [[ "$SET_ASIDE_ISSUES" == *" ${1} "* ]]
}

# Called when the loop runs out of workable issues: the next pass is a new
# sweep, and everything set aside is eligible again.
start_new_sweep() {
  SET_ASIDE_ISSUES=" "
}

# Issues created by to-tickets carry a "## Blocked by" section listing
# prerequisite issues as "- #NNN (reason)" bullets. Print the numbers.
extract_blockers() {
  local body="$1"
  awk '/^## Blocked by/{f=1; next} /^## /{f=0} f' <<<"$body" \
    | grep -oE '#[0-9]+' | tr -d '#' | sort -un
}

# Of an issue's blockers, print only those still open.
open_blockers() {
  local body="$1" n state
  for n in $(extract_blockers "$body"); do
    state="$(gh issue view "$n" --repo "$REPO" --json state -q '.state' 2>/dev/null || echo "")"
    if [[ "$state" == "OPEN" ]]; then
      echo "$n"
    fi
  done
  return 0
}

# Dependency gate: a ready-for-agent issue whose blockers aren't closed
# yet is not actually ready, whatever its label says (see
# docs/agents/triage-labels.md). Relabel it blocked instead of claiming
# it, with a comment naming the open blockers, and re-check on every
# loop iteration via promote_unblocked_issues so it comes back on its own
# once they close.
block_on_dependency() {
  local n="$1" open_list="$2" fmt
  fmt="$(sed 's/^/#/' <<<"$open_list" | paste -sd, -)"
  gh issue edit "$n" --repo "$REPO" \
    --remove-label ready-for-agent --remove-label in-progress-by-agent \
    --add-label blocked
  gh issue comment "$n" --repo "$REPO" --body "Blocked: dependency issue(s) $fmt are still open. The loop will not pick this up until they're closed — re-labeled \`blocked\` (was \`ready-for-agent\`). It'll be re-labeled \`ready-for-agent\` automatically once they close. (loop.sh dependency gate)"
  echo "Issue #$n has open blocker(s) $fmt — labeled blocked, deferring." >&2
}

# Runs once per outer loop iteration, before picking. Anything labeled
# blocked whose blockers have all closed since the last check goes back
# to ready-for-agent on its own — no human needs to notice and flip it.
promote_unblocked_issues() {
  local blocked_json n body still_open
  blocked_json="$(gh issue list --repo "$REPO" --label blocked \
    --json number,body --limit 50)"
  while IFS= read -r issue_json; do
    [[ -z "$issue_json" ]] && continue
    n="$(jq -r '.number' <<<"$issue_json")"
    body="$(jq -r '.body' <<<"$issue_json")"
    still_open="$(open_blockers "$body")"
    if [[ -z "$still_open" ]]; then
      gh issue edit "$n" --repo "$REPO" --remove-label blocked --add-label ready-for-agent
      gh issue comment "$n" --repo "$REPO" --body "Unblocked: all dependency issues are now closed. Re-labeled \`ready-for-agent\`. (loop.sh dependency gate)"
      echo "Issue #$n unblocked — dependencies closed, back to ready-for-agent." >&2
    fi
  done < <(jq -c '.[]' <<<"$blocked_json")
}

pick_issue() {
  local candidates n body still_open
  candidates="$(gh issue list --repo "$REPO" --label ready-for-agent \
    --json number,title,body,labels --limit 50 \
    | jq -c '[.[] | select([.labels[].name] | (index("in-progress-by-agent") or index("blocked-for-agent")) | not)]
              | sort_by(.number)')"

  while IFS= read -r issue_json; do
    [[ -z "$issue_json" ]] && continue
    n="$(jq -r '.number' <<<"$issue_json")"
    body="$(jq -r '.body' <<<"$issue_json")"
    # An issue that already failed this sweep waits for the next one, so one
    # broken issue cannot starve every other ready issue.
    if issue_set_aside "$n"; then
      continue
    fi
    still_open="$(open_blockers "$body")"
    if [[ -n "$still_open" ]]; then
      block_on_dependency "$n" "$still_open"
      continue
    fi
    echo "$issue_json"
    return
  done < <(jq -c '.[]' <<<"$candidates")
}

# Comment posted on an issue's first orphan recovery.
hard_kill_reap_comment() {
  cat <<EOF
Recovered: found labeled \`in-progress-by-agent\` with no corresponding run — the prior attempt was likely killed out from under it (container OOM, host restart, etc.). Re-labeled \`ready-for-agent\` to retry. (loop.sh startup reap)
EOF
}

# Comment posted when the same issue orphans a second time in a row.
hard_kill_anomaly_comment() {
  cat <<EOF
Blocked: this issue was found labeled \`in-progress-by-agent\` with no corresponding run for the second time in a row. Re-labeled \`blocked-for-agent\` instead of retrying blind again. A human should check \`ralph-logs/\` if still present, then re-label \`ready-for-agent\` to resume. (loop.sh startup reap)
EOF
}

# Runs once at loop.sh startup, before the main iteration loop. loop.sh
# handles one issue at a time in a single synchronous process and only
# sets in-progress-by-agent for the duration of its own
# run_build_iteration call — so any issue still carrying that label when
# a *fresh* loop.sh process starts is proof the process that set it is
# gone (crashed/killed), not a live run. No staleness timer or
# container/PID probing needed; the label alone is the signal. See #134,
# #137.
#
# First orphan: reset to ready-for-agent and mark hard-kill-seen, same
# trust level as a checkpoint-timeout retry. Second orphan in a row
# (hard-kill-seen already present): escalate to blocked-for-agent instead
# of retrying blind again.
reap_orphaned_in_progress_issues() {
  local orphans_json n
  orphans_json="$(gh issue list --repo "$REPO" --label in-progress-by-agent \
    --json number,labels --limit 50)"
  while IFS= read -r issue_json; do
    [[ -z "$issue_json" ]] && continue
    n="$(jq -r '.number' <<<"$issue_json")"
    if jq -e '[.labels[].name] | index("hard-kill-seen")' <<<"$issue_json" >/dev/null; then
      gh issue edit "$n" --repo "$REPO" \
        --remove-label in-progress-by-agent --remove-label hard-kill-seen \
        --add-label blocked-for-agent
      gh issue comment "$n" --repo "$REPO" --body "$(hard_kill_anomaly_comment)"
      echo "Issue #$n orphaned twice in a row — blocked for human review." >&2
    else
      gh issue edit "$n" --repo "$REPO" \
        --remove-label in-progress-by-agent \
        --add-label hard-kill-seen --add-label ready-for-agent
      gh issue comment "$n" --repo "$REPO" --body "$(hard_kill_reap_comment)"
      echo "Issue #$n found in-progress-by-agent at startup with no live run — recovered to ready-for-agent." >&2
    fi
  done < <(jq -c '.[]' <<<"$orphans_json")
}

run_build_iteration() {
  local issue_json="$1"
  local n title body

  n="$(jq -r '.number' <<<"$issue_json")"
  title="$(jq -r '.title' <<<"$issue_json")"
  body="$(jq -r '.body' <<<"$issue_json")"

  gh issue edit "$n" --repo "$REPO" --add-label in-progress-by-agent

  local ts log_file
  ts="$(date +%Y%m%d-%H%M%S)"
  log_file="$LOG_DIR/issue-${n}-${ts}.log"

  # main.mts reports three outcomes, so the exit code matters, not just
  # pass/fail. Take main.mts's own status from PIPESTATUS[0] rather than `$?`:
  # under `set -o pipefail` (line 14) `$?` is the whole pipeline's status, so a
  # tee failure would be indistinguishable from an outcome main.mts chose.
  # The trade is that tee failing on its own then reads as success — the label
  # contract stays right, but an unwritable log goes unnoticed.
  # Capturing in the else branch is safe: nothing runs between the pipeline and
  # the assignment to overwrite PIPESTATUS.
  local status
  if RALPH_AGENT="$AGENT" ISSUE_NUMBER="$n" ISSUE_TITLE="$title" ISSUE_BODY="$body" \
       npx tsx .sandcastle/main.mts 2>&1 | tee "$log_file"; then
    status=0
  else
    status="${PIPESTATUS[0]}"
  fi

  if [[ "$status" -eq 0 ]]; then
    # Also clear ready-for-agent: without this, a successfully completed
    # issue stays eligible for re-selection forever, and the next
    # iteration re-picks it, finds nothing new to commit, and reports a
    # false "blocked" failure. Success means done, not queue-again.
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent --remove-label ready-for-agent --remove-label hard-kill-seen
  elif [[ "$status" -eq 2 ]]; then
    # The work landed but CI stayed red, the merge was rejected, or review
    # findings are outstanding. The PR is open and already explains itself,
    # so hand the issue to a person rather than clearing or retrying it.
    echo "Issue #$n needs a human — PR left open (see $log_file)."
    gh issue edit "$n" --repo "$REPO" \
      --remove-label in-progress-by-agent --remove-label ready-for-agent \
      --remove-label hard-kill-seen \
      --add-label ready-for-human
  else
    # Every failure ends here, whatever caused it. The loop used to grep the
    # log to decide between branches that all ended in "try again", and got it
    # wrong for a quarter of runs, whose log holds only a pointer to the real
    # log. So: keep ready-for-agent, set the issue aside for the rest of this
    # sweep, back off, and move to the next issue. Repetition is the recovery
    # strategy, including for failure modes not yet seen.
    echo "Iteration for issue #$n failed (see $log_file). Set aside for this sweep."
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent
    set_aside_issue "$n"
    # Remove empty branch left by failed sandbox setup so next retry
    # starts clean (no zero-commit branch to confuse verification).
    if git rev-parse --verify "ralph/issue-$n" >/dev/null 2>&1; then
      if git diff --quiet "master..ralph/issue-$n" 2>/dev/null; then
        git branch -D "ralph/issue-$n" 2>/dev/null || true
        git push origin --delete "ralph/issue-$n" 2>/dev/null || true
      fi
    fi
    sleep "$FAILURE_BACKOFF_SECS"
  fi
}

main() {
  # Once, before the loop starts: recover any issue left in-progress by
  # a hard-killed prior run (see reap_orphaned_in_progress_issues).
  reap_orphaned_in_progress_issues

  local i=0
  while :; do
    i=$((i + 1))
    if [[ "$MAX_ITER" != "0" && "$i" -gt "$MAX_ITER" ]]; then
      echo "Reached max iterations ($MAX_ITER). Stopping."
      break
    fi

    echo "=== Ralph iteration $i (build: $AGENT, review: claude) ==="
    promote_unblocked_issues
    issue_json="$(pick_issue)"

    if [[ -n "$issue_json" ]]; then
      run_build_iteration "$issue_json"
    elif [[ "$MAX_ITER" != "0" ]]; then
      # A capped run is a test run. Waiting half an hour for work to appear
      # would defeat the point, so stop instead.
      echo "No workable issues. Stopping (iteration cap set)."
      exit 0
    else
      # The sweep is over: every ready issue is either done or set aside.
      # Sleeping rather than exiting is what lets the loop recover on its own
      # — a session limit resets, a blocker closes, a new issue is queued —
      # with no one restarting it.
      echo "No workable issues. Sleeping ${IDLE_SLEEP_SECS}s, then re-checking."
      sleep "$IDLE_SLEEP_SECS"
      start_new_sweep
    fi
  done
}

# Guard so tests can `source` this file (to call functions like pick_issue
# or run_build_iteration directly) without kicking off the live loop.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
