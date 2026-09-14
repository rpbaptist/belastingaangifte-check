# Context

You are working ONLY on issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

{{ISSUE_BODY}}

You are already on a dedicated branch inside an isolated sandbox. Do not
switch branches. Do not touch any other issue.

!`cat AGENTS.md`
!`cat CONTEXT.md`

# Resuming

Check `git log --oneline` on this branch before exploring. If a prior,
interrupted run left a `Progress notes: issue #{{ISSUE_NUMBER}}` commit,
read the note it added (`git show <sha> --stat` to find the file) before
re-deriving anything — it records what was already ruled in/out so you
don't repeat that work.

# Task

Follow this repo's documented workflow: `to-spec` (if not already speced) →
implement → TDD → `code-review` checklist → atomic commits → `fallow audit`
clean.

- Search the codebase before concluding something isn't implemented.
- Only one subagent validates (build/test); several may search/write.
- Capture the why: when a test passes, note near it why the behavior matters.
- Run the full test suite and `fallow audit`. Both must pass before you commit.
- Commit with atomic commits and an imperative subject line, per this repo's
  commit style. Do NOT push and do NOT run `gh pr create` — that happens
  outside the sandbox, on the host, after you exit.
- If you cannot get tests/build/lint passing after retrying, or get stuck:
  do NOT force a code commit to satisfy the loop. Leave the working tree
  as-is.
- If you did non-trivial exploration/analysis before getting stuck or
  running low on budget (a dependency you traced, a design decision you
  ruled out, findings from reading several files), commit ONLY a short
  progress note about it, separate from any code: write a few sentences to
  `.sandcastle/progress/issue-{{ISSUE_NUMBER}}.md` (create the dir if
  needed) and commit it alone with subject `Progress notes: issue
  #{{ISSUE_NUMBER}}`. This is not a code commit and is exempt from the
  tests/fallow gate above — its only job is to save the next run from
  re-discovering the same things. Skip it if you have nothing a resumed
  run would need.

# Done

Before finishing, write a PR description (what changed and why, per this
repo's commit-message convention) wrapped in a `<pr_description>` tag, e.g.:

```
<pr_description>
One paragraph summary of the change and why it was needed.
</pr_description>
```

Then output `<promise>COMPLETE</promise>` to signal you're done.
