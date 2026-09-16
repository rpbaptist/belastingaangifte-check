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
    [[ "$state" == "OPEN" ]] && echo "$n"
  done
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
              | sort_by(.number) | .[]')"

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
  # Transient infra signatures (not agent logic): git config.lock
  # contention from bind-mounted .git/config between host + sandbox.
  # See ralph-logs/issue-105-20260914-124532.log.
  grep -q "could not lock config file" "$log_file" 2>/dev/null && return 0
  grep -q "config\.lock" "$log_file" 2>/dev/null && return 0
  grep -q "ExecError.*git config" "$log_file" 2>/dev/null && return 0
  # Claude session limit — resets on its own, not an agent/issue problem.
  # See ralph-logs/issue-{106,107,108,109}-20260914-*.log.
  is_session_limit "$log_file" && return 0
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

# Writes a minimal progress note directly onto ralph/issue-N (creating it
# from master first if the sandbox never got that far) so the next
# attempt's "Resuming" prompt path finds it via git log/git show and
# skips re-exploration. Uses plumbing (read-tree/commit-tree/update-ref)
# rather than checkout, so it never touches the host's own working tree
# or index — this can run at any point without disturbing whatever
# branch the host currently has checked out.
#
# Only updates the local ref — never pushes to origin. That's consistent
# with main.mts's push gate, which already refuses to push a branch
# whose only commits are progress notes. Anything reading commit history
# to detect these notes (e.g. #121's anomaly check) must read local
# refs, not the remote.
write_progress_note() {
  local n="$1" log_file="$2"
  local branch="ralph/issue-$n"
  local note_path=".sandcastle/progress/issue-${n}.md"

  local base_ref
  if git rev-parse --verify "refs/heads/$branch" >/dev/null 2>&1; then
    base_ref="refs/heads/$branch"
  else
    base_ref="refs/heads/master"
  fi
  local parent_sha
  parent_sha="$(git rev-parse "$base_ref")"

  local reset_str
  reset_str="$(grep -io "resets [0-9]\{1,2\}:[0-9]\{2\}[ap]m (UTC)" "$log_file" 2>/dev/null | head -1)"
  [[ -z "$reset_str" ]] && reset_str="reset time not found in log"

  local note_content
  note_content="$(cat <<EOF
# Progress — issue #$n — $(date -u +"%Y-%m-%d %H:%M UTC")

Session-limit hit, $reset_str.
Log: $log_file

Resume: this note only confirms a session-limit retry happened. Check
\`git log --oneline\` / \`git show\` on this branch for any real prior
work before re-exploring the issue from scratch.
EOF
)"

  local tmp_index
  tmp_index="$(mktemp)"
  rm -f "$tmp_index"
  GIT_INDEX_FILE="$tmp_index" git read-tree "$parent_sha"
  local blob_sha
  blob_sha="$(printf '%s\n' "$note_content" | git hash-object -w --stdin)"
  GIT_INDEX_FILE="$tmp_index" git update-index --add --cacheinfo "100644,$blob_sha,$note_path"
  local tree_sha
  tree_sha="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"
  rm -f "$tmp_index"

  local commit_sha
  commit_sha="$(GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Ralph (belastingaangifte-check agent)}" \
    GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-ralph-agent@users.noreply.github.com}" \
    GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-Ralph (belastingaangifte-check agent)}" \
    GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-ralph-agent@users.noreply.github.com}" \
    git commit-tree "$tree_sha" -p "$parent_sha" -m "Progress notes: issue #$n")"
  git update-ref "refs/heads/$branch" "$commit_sha"
}

# Whether issue N currently carries a given label on the tracker. Real
# lookup, not the possibly-stale labels captured when pick_issue built
# the candidate list — a sandbox run can take a long time, and the label
# set on GitHub is the only state this check can trust to still be
# accurate (see is_session_limit_anomaly).
#
# A `gh` failure (network blip, auth) and a genuine "label not present"
# both return 1 here, so callers fail safe (e.g. is_session_limit_anomaly
# treats either as "not an anomaly", never wrongly blocking an issue over
# a transient API hiccup) — but a `gh` failure specifically is echoed to
# stderr first, so it still shows up in the run's log instead of being
# silently indistinguishable from "no such label".
issue_has_label() {
  local n="$1" label="$2"
  local labels_output
  if ! labels_output="$(gh issue view "$n" --repo "$REPO" --json labels -q '.labels[].name' 2>&1)"; then
    echo "Warning: gh issue view failed for #$n while checking for label \"$label\" — treating as absent: $labels_output" >&2
    return 1
  fi
  grep -qx "$label" <<<"$labels_output"
}

# Count of "Progress notes: issue #N" commits on ralph/issue-N ahead of
# master — the exact detection source #121 specifies. Zero if the branch
# doesn't exist locally at all (the state-loss case this exists to catch).
progress_note_count() {
  local n="$1" branch="ralph/issue-$n"
  if ! git rev-parse --verify "refs/heads/$branch" >/dev/null 2>&1; then
    echo 0
    return
  fi
  git log --oneline --grep="Progress notes: issue #$n" "master..$branch" 2>/dev/null | wc -l | tr -d ' '
}

# True when this session-limit hit is the second (or later) in a row for
# issue N (the `session-limit-seen` label already present, applied on a
# prior hit) but the progress note that hit should have left behind is
# gone. write_progress_note only updates a local, unpushed ref (see its
# comment), so this can only happen if local RALPH-host state was lost
# between attempts — a host restart/redeploy/disk reset, or someone
# deleting the branch. Not reachable via write_progress_note itself
# failing: that runs under `set -euo pipefail` and would crash loop.sh
# outright rather than leave this silently undetected.
is_session_limit_anomaly() {
  local n="$1"
  issue_has_label "$n" "session-limit-seen" || return 1
  [[ "$(progress_note_count "$n")" -eq 0 ]]
}

# Comment posted when is_session_limit_anomaly trips. Broken out so it
# can be asserted on directly without invoking gh.
session_limit_anomaly_comment() {
  local n="$1"
  cat <<EOF
Blocked: session limit hit twice in a row for this issue, and the progress note from the first hit is no longer on \`ralph/issue-$n\` (likely local RALPH-host state was reset). Re-labeled \`blocked-for-agent\` instead of retrying blind. A human should check \`ralph-logs/\` if still present, then re-label \`ready-for-agent\` to resume. (loop.sh anomaly detector)
EOF
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
    gh issue edit "$n" --repo "$REPO" --remove-label in-progress-by-agent --remove-label ready-for-agent --remove-label session-limit-seen
  else
    echo "Iteration for issue #$n failed (see $log_file)."
    if is_session_limit "$log_file" && is_session_limit_anomaly "$n"; then
      echo "Session-limit anomaly detected — no surviving progress note after a repeat hit, blocking for human review."
      gh issue edit "$n" --repo "$REPO" \
        --remove-label in-progress-by-agent --remove-label session-limit-seen \
        --add-label blocked-for-agent
      gh issue comment "$n" --repo "$REPO" --body "$(session_limit_anomaly_comment "$n")"
    elif is_transient_failure "$log_file"; then
      echo "Transient infra failure detected — not marking blocked, will retry."
      if is_session_limit "$log_file"; then
        if ! issue_has_label "$n" "session-limit-seen"; then
          gh issue edit "$n" --repo "$REPO" --add-label session-limit-seen
        fi
        write_progress_note "$n" "$log_file"
        wait_out_session_limit "$log_file"
      fi
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

main() {
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
      run_plan_iteration
    fi
  done
}

# Guard so tests can `source` this file (to call functions like
# is_transient_failure or write_progress_note directly) without kicking
# off the live loop.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
