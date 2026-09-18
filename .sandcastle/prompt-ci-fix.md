# Context

CI is failing on PR #{{PR_NUMBER}} (for issue #{{ISSUE_NUMBER}}), which you
(a prior iteration) opened. You are on the same branch, inside a fresh
sandbox — the worktree has your prior commits already. This is fix attempt
{{ATTEMPT}} of {{MAX_ATTEMPTS}}.

!`sed -n '/^### Commit style/,$p' AGENTS.md`

# Failing check logs

{{CI_LOG}}

# Task

Diagnose and fix whatever's making CI fail, based on the logs above. Common
causes here: `npx tsc --noEmit`, the test suite, `npx prettier --check .`,
`npm run lint`, `fallow audit` — run the same commands locally to reproduce
before changing anything.

- Fix the root cause. Do not disable, skip, or loosen a check just to make
  it pass (no `--no-verify`, no deleting a failing test, no widening a type
  to `any`) unless the check itself is wrong — and if you believe that, say
  so in a commit message rather than silently working around it.
- Before committing, run every check CI runs, in the same order it does:
  `npx tsc --noEmit`, the full test suite, `npx prettier --check .`,
  `npm run lint`, `fallow audit`. All must pass locally before you commit.
- Commit with atomic commits and an imperative subject line, per this
  repo's commit style. Do NOT push — that happens outside the sandbox, on
  the host, after you exit.
- If you cannot reproduce the failure, or fix it after genuinely trying: do
  NOT force a commit to satisfy the loop. Leave the working tree as-is —
  no commits means the host leaves the PR open for a human.

# Done

Output `<promise>COMPLETE</promise>` when finished (whether or not you made
a fix).
