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

# Of an issue's blockers, print only those still open. A blocker whose state
# cannot be read — network blip, rate limit, deleted issue — counts as open.
# Failing that way round means the loop defers an issue it could perhaps have
# worked on, and the next sweep asks again; failing the other way would start
# a run on an issue whose prerequisite is unfinished.
open_blockers() {
  local body="$1" n state
  for n in $(extract_blockers "$body"); do
    if ! state="$(gh issue view "$n" --repo "$REPO" --json state -q '.state' 2>/dev/null)"; then
      echo "$n"
      continue
    fi
    if [[ "$state" != "CLOSED" ]]; then
      echo "$n"
    fi
  done
  return 0
}

pick_issue() {
  local candidates n body
  candidates="$(gh issue list --repo "$REPO" --label ready-for-agent \
    --json number,title,body --limit 50 | jq -c 'sort_by(.number)')"

  while IFS= read -r issue_json; do
    [[ -z "$issue_json" ]] && continue
    n="$(jq -r '.number' <<<"$issue_json")"
    body="$(jq -r '.body' <<<"$issue_json")"
    # An issue that already failed this sweep waits for the next one, so one
    # broken issue cannot starve every other ready issue.
    if issue_set_aside "$n"; then
      continue
    fi
    # An issue whose blockers are still open is skipped silently. The loop
    # used to relabel it and comment, then undo both once the blockers
    # closed; recomputing the blockers here costs one lookup per blocker and
    # needs no state to keep in sync. The issue becomes workable again on its
    # own the moment its blockers close.
    if [[ -n "$(open_blockers "$body")" ]]; then
      continue
    fi
    echo "$issue_json"
    return
  done < <(jq -c '.[]' <<<"$candidates")
}

run_build_iteration() {
  local issue_json="$1"
  local n title body

  n="$(jq -r '.number' <<<"$issue_json")"
  title="$(jq -r '.title' <<<"$issue_json")"
  body="$(jq -r '.body' <<<"$issue_json")"

  # No in-progress label: the loop works one issue at a time in a single
  # synchronous process, so the label only ever restated what this process
  # already knew — and left state to reconcile when the process died.

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
    gh issue edit "$n" --repo "$REPO" --remove-label ready-for-agent
  elif [[ "$status" -eq 2 ]]; then
    # The work landed but CI stayed red, the merge was rejected, or review
    # findings are outstanding. The PR is open and already explains itself,
    # so hand the issue to a person rather than clearing or retrying it.
    echo "Issue #$n needs a human — PR left open (see $log_file)."
    gh issue edit "$n" --repo "$REPO" \
      --remove-label ready-for-agent --add-label ready-for-human
  else
    # Every failure ends here, whatever caused it. The loop used to grep the
    # log to decide between branches that all ended in "try again", and got it
    # wrong for a quarter of runs, whose log holds only a pointer to the real
    # log. So: keep ready-for-agent, set the issue aside for the rest of this
    # sweep, back off, and move to the next issue. Repetition is the recovery
    # strategy, including for failure modes not yet seen.
    echo "Iteration for issue #$n failed (see $log_file). Set aside for this sweep."
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
  # Nothing to reconcile at startup. The loop holds no durable state of its
  # own, so a killed run leaves nothing behind and restarting is safe at any
  # moment, by construction rather than by recovery code.
  local i=0
  while :; do
    i=$((i + 1))
    if [[ "$MAX_ITER" != "0" && "$i" -gt "$MAX_ITER" ]]; then
      echo "Reached max iterations ($MAX_ITER). Stopping."
      break
    fi

    echo "=== Ralph iteration $i (build: $AGENT, review: claude) ==="
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
