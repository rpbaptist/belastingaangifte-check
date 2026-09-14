# Context

You are working ONLY on issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

{{ISSUE_BODY}}

You are already on a dedicated branch inside an isolated sandbox. Do not
switch branches. Do not touch any other issue.

!`cat AGENTS.md`
!`cat CONTEXT.md`

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
  do NOT force a commit to satisfy the loop. Leave the working tree as-is.

# Done

Before finishing, write a PR description (what changed and why, per this
repo's commit-message convention) wrapped in a `<pr_description>` tag, e.g.:

```
<pr_description>
One paragraph summary of the change and why it was needed.
</pr_description>
```

Then output `<promise>COMPLETE</promise>` to signal you're done.
