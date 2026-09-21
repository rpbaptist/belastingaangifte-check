#!/usr/bin/env bash
# Deterministic clean-up of a RALPH pull request's branch, run by review-lib
# inside a sandbox checkout of that branch just before the merge gate. The
# host pushes whatever this commits. It is piped to `bash -s` from the host's
# copy, so a branch created before this file existed still gets it.

set -euo pipefail

# The build agent's checkpoint notes exist for resuming an unfinished attempt.
# The attempt is finished by now, and a squash merge would carry them onto
# master.
if [[ -n "$(git ls-files .sandcastle/progress)" ]]; then
  git rm -r -q .sandcastle/progress
  git commit -q -m "Remove progress notes"
fi

# CI's format and lint checks fail on drift an agent did not fix itself. Lint
# first: eslint defers every formatting rule to prettier, so its fixes cannot
# be reformatted away afterwards. eslint --fix exits non-zero when errors it
# cannot fix remain; CI reports those, and the formatter still runs.
npx eslint . --fix || true
npm run format

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -q -m "Fix lint and formatting"
fi
