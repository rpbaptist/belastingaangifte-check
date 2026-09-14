#!/usr/bin/env bash
# loop.sh — RALPH loop for belastingaangifte-check.
#
# main.mts (.sandcastle/main.mts) owns sandboxing, branch strategy, commit
# verification, push, and PR creation. loop.sh stays dumb: pick an issue,
# label it, run main.mts, read its exit code, relabel.
#
# Usage:
#   ./loop.sh                          # unlimited iterations (build: claude)
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

pick_issue() {
  gh issue list --repo "$REPO" --label ready-for-agent \
    --json number,title,body,labels --limit 50 \
    | jq -r '[.[] | select([.labels[].name] | (index("in-progress-by-agent") or index("blocked-for-agent")) | not)]
              | sort_by(.number) | .[0] // empty'
}

is_transient_failure() {
  local log_file="$1"
  # Transient infra signatures (not agent logic): git config.lock
  # contention from bind-mounted .git/config between host + sandbox.
  # See ralph-logs/issue-105-20260914-124532.log.
  grep -q "could not lock config file" "$log_file" 2>/dev/null && return 0
  grep -q "config\.lock" "$log_file" 2>/dev/null && return 0
  grep -q "ExecError.*git config" "$log_file" 2>/dev/null && return 0
  return 1
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

  # Proactive stale-lock cleanup before sandbox (host + sandbox share
  # .git/config via bind mount — host git ops can leave config.lock).
  rm -f .git/config.lock

  if RALPH_AGENT="$AGENT" ISSUE_NUMBER="$n" ISSUE_TITLE="$title" ISSUE_BODY="$body" \
       npx tsx .sandcastle/main.mts 2>&1 | tee "$log_file"; then
    # Also clear ready-for-agent: without this, a successfully completed
    # issue stays eligible for re-selection forever, and the next
    # iteration re-picks it, finds nothing new to commit, and reports a
    # false "blocked" failure. Success means done, not queue-again.
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent --remove-label ready-for-agent
  else
    echo "Iteration for issue #$n failed (see $log_file)."
    if is_transient_failure "$log_file"; then
      echo "Transient infra failure detected (git config.lock) — not marking blocked, will retry next iteration."
      gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent
      rm -f .git/config.lock
      # Remove empty branch left by failed sandbox setup so next retry
      # starts clean (no zero-commit branch to confuse verification).
      if git rev-parse --verify "ralph/issue-$n" >/dev/null 2>&1; then
        if git diff --quiet "master..ralph/issue-$n" 2>/dev/null; then
          git branch -D "ralph/issue-$n" 2>/dev/null || true
          git push origin --delete "ralph/issue-$n" 2>/dev/null || true
        fi
      fi
    else
      gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent --add-label blocked-for-agent
    fi
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

  echo "=== Ralph iteration $i (build: $AGENT, review: claude) ==="
  issue_json="$(pick_issue)"

  if [[ -n "$issue_json" ]]; then
    run_build_iteration "$issue_json"
  else
    run_plan_iteration
  fi
done
