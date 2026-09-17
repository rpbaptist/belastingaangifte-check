# Context

You are working ONLY on issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

{{ISSUE_BODY}}

You are already on a dedicated branch inside an isolated sandbox. Do not
switch branches. Do not touch any other issue.

Work only on what this issue describes. If you notice an unrelated problem
while exploring, leave it — don't fix it inline. The post-merge review pass
files a `needs-triage` issue for anything out of scope.

!`sed -n '/^### Commit style/,$p' AGENTS.md`
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
- Checkpoint routinely, not only when stuck or low on budget: every time
  you've read 5+ files since the last checkpoint, or ruled out a design
  direction or traced a dependency to a conclusion — and again before
  stopping if stuck or low on budget. Write a few sentences of current-best
  state to `.sandcastle/progress/issue-{{ISSUE_NUMBER}}.md` (create the dir
  if needed), OVERWRITING any prior content so one run always finds one
  current note, not a history to reconcile. Commit it alone with subject
  `Progress notes: issue #{{ISSUE_NUMBER}}` — exempt from the tests/fallow
  gate above. Skip only if you finished the task or haven't started
  exploring yet.

# Done

Before finishing, write a PR description (what changed and why, per this
repo's commit-message convention) wrapped in a `<pr_description>` tag, e.g.:

```
<pr_description>
One paragraph summary of the change and why it was needed.
</pr_description>
```

Then output `<promise>COMPLETE</promise>` to signal you're done.
