#!/usr/bin/env bash
# loop.sh — RALPH loop for belastingaangifte-check.
#
# main.mts (.sandcastle/main.mts) owns sandboxing, branch strategy, commit
# verification, push, and PR creation. loop.sh stays dumb: pick an issue,
# label it, run main.mts, read its exit code, relabel.
#
# Usage:
#   ./loop.sh          # unlimited iterations
#   ./loop.sh 20        # cap at 20 iterations

set -euo pipefail

# Without this, Ctrl+C only kills the current subprocess pipeline — bash
# treats that as an ordinary command failure, runs the iteration's failure
# branch, and the outer while loop just continues to the next issue. Make
# an interrupt actually stop the script.
trap 'echo; echo "Interrupted — stopping loop."; exit 130' INT TERM

MAX_ITER="${1:-0}"
REPO="rpbaptist/belastingaangifte-check"
LOG_DIR="$(pwd)/ralph-logs"
mkdir -p "$LOG_DIR"

pick_issue() {
  gh issue list --repo "$REPO" --label ready-for-agent \
    --json number,title,body,labels --limit 50 \
    | jq -r '[.[] | select([.labels[].name] | (index("in-progress-by-agent") or index("blocked-for-agent")) | not)]
              | sort_by(.number) | .[0] // empty'
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

  if ISSUE_NUMBER="$n" ISSUE_TITLE="$title" ISSUE_BODY="$body" \
       npx tsx .sandcastle/main.mts 2>&1 | tee "$log_file"; then
    # Also clear ready-for-agent: without this, a successfully completed
    # issue stays eligible for re-selection forever, and the next
    # iteration re-picks it, finds nothing new to commit, and reports a
    # false "blocked" failure. Success means done, not queue-again.
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent --remove-label ready-for-agent
  else
    echo "Iteration for issue #$n failed (see $log_file)."
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent --add-label blocked-for-agent
  fi
}

run_plan_iteration() {
  # TODO: not yet wired up — grill-with-docs planning-mode fallback when
  # the ready-for-agent queue is empty. Deliberately deferred until build
  # mechanics are proven supervised on real issues.
  echo "No ready-for-agent issues, and planning-mode fallback isn't wired up yet. Stopping."
  exit 0
}

i=0
while :; do
  i=$((i + 1))
  if [[ "$MAX_ITER" != "0" && "$i" -gt "$MAX_ITER" ]]; then
    echo "Reached max iterations ($MAX_ITER). Stopping."
    break
  fi

  echo "=== Ralph iteration $i ==="
  issue_json="$(pick_issue)"

  if [[ -n "$issue_json" ]]; then
    run_build_iteration "$issue_json"
  else
    run_plan_iteration
  fi
done
