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
    still_open="$(open_blockers "$body")"
    if [[ -n "$still_open" ]]; then
      block_on_dependency "$n" "$still_open"
      continue
    fi
    echo "$issue_json"
    return
  done < <(jq -c '.[]' <<<"$candidates")
}

is_transient_failure() {
  local log_file="$1"
  # Claude session limit — resets on its own, not an agent/issue problem.
  # See ralph-logs/issue-{106,107,108,109}-20260914-*.log.
  is_session_limit "$log_file" && return 0
  # main.mts's self-imposed wall-clock ceiling — retry, don't block (#128).
  is_checkpoint_timeout "$log_file" && return 0
  return 1
}

# Whether a log shows a Claude session-limit exit. Shared by
# is_transient_failure and run_build_iteration's session-limit branch so
# the two never drift apart on the match string. Case-insensitive: this
# text comes from the CLI, not us, and a wording tweak there shouldn't
# silently stop matching.
is_session_limit() {
  local log_file="$1"
  grep -qi "hit your session limit" "$log_file" 2>/dev/null
}

# Whether a log shows main.mts's checkpoint-timeout sentinel — its
# AbortController fired because the run exceeded RALPH_CHECKPOINT_TIMEOUT_MS
# (default 90 minutes). Parallel to is_session_limit: both mean retry.
is_checkpoint_timeout() {
  local log_file="$1"
  grep -q "RALPH_CHECKPOINT_TIMEOUT_HIT" "$log_file" 2>/dev/null
}

# Session-limit hits used to retry immediately on every iteration with no
# backoff, hammering the API for hours until the limit reset on its own
# (see ralph-logs/issue-105-20260914-1534*.log — 6 retries in under 5 min).
# Sleep until the stated reset time instead of spinning.
wait_out_session_limit() {
  local log_file="$1"
  local FALLBACK_SECS=900
  local MAX_SECS=21600 # 6h safety cap in case parsing goes wrong

  local reset_str
  reset_str="$(grep -o "resets [0-9]\{1,2\}:[0-9]\{2\}[ap]m (UTC)" "$log_file" 2>/dev/null \
    | head -1 | sed -E 's/resets (.*) \(UTC\)/\1/')"

  if [[ -z "$reset_str" ]]; then
    echo "Session limit hit but reset time not found in log — sleeping ${FALLBACK_SECS}s."
    sleep "$FALLBACK_SECS"
    return
  fi

  local now_epoch target_epoch
  now_epoch="$(date -u +%s)"
  target_epoch="$(date -u -d "$reset_str UTC" +%s 2>/dev/null || echo "")"

  if [[ -z "$target_epoch" ]]; then
    echo "Session limit hit but reset time \"$reset_str\" didn't parse — sleeping ${FALLBACK_SECS}s."
    sleep "$FALLBACK_SECS"
    return
  fi

  if (( target_epoch <= now_epoch )); then
    target_epoch="$(date -u -d "tomorrow $reset_str UTC" +%s)"
  fi

  local sleep_secs=$(( target_epoch - now_epoch + 60 )) # 60s buffer past reset
  if (( sleep_secs > MAX_SECS )); then
    sleep_secs="$MAX_SECS"
  fi

  echo "Session limit hit, resets $reset_str (UTC) — sleeping ${sleep_secs}s."
  sleep "$sleep_secs"
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
    echo "Iteration for issue #$n failed (see $log_file)."
    if is_transient_failure "$log_file"; then
      echo "Transient infra failure detected — not marking blocked, will retry."
      if is_session_limit "$log_file"; then
        wait_out_session_limit "$log_file"
      elif is_checkpoint_timeout "$log_file"; then
        echo "Checkpoint timeout — retrying next iteration immediately, no wait."
      fi
      gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent
      # Remove empty branch left by failed sandbox setup so next retry
      # starts clean (no zero-commit branch to confuse verification).
      if git rev-parse --verify "ralph/issue-$n" >/dev/null 2>&1; then
        if git diff --quiet "master..ralph/issue-$n" 2>/dev/null; then
          git branch -D "ralph/issue-$n" 2>/dev/null || true
          git push origin --delete "ralph/issue-$n" 2>/dev/null || true
        fi
      fi
    else
      gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent --remove-label ready-for-agent --add-label blocked-for-agent
    fi
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
    else
      echo "No ready-for-agent issues. Stopping."
      exit 0
    fi
  done
}

# Guard so tests can `source` this file (to call functions like
# is_transient_failure or run_build_iteration directly) without kicking
# off the live loop.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
