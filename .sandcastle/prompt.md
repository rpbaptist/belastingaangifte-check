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
- Checkpoint routinely, not only when stuck or low on budget. As soon as
  EITHER of these happens, commit a progress note before doing anything
  else: (a) you've read 5 or more files, or (b) you've ruled out a design
  direction or traced a dependency to a conclusion. Write a few sentences
  to `.sandcastle/progress/issue-{{ISSUE_NUMBER}}.md` (create the dir if
  needed) summarizing the current-best state, and commit it alone with
  subject `Progress notes: issue #{{ISSUE_NUMBER}}`. This is not a code
  commit and is exempt from the tests/fallow gate above — its only job is
  to save a later run from re-discovering the same things.
- Checkpoint again every time either trigger condition re-fires later in
  the same run (another 5+ files read since the last checkpoint, or
  another design decision ruled out). Each checkpoint OVERWRITES
  `.sandcastle/progress/issue-{{ISSUE_NUMBER}}.md` with the current-best
  summary — do not append to or keep prior checkpoint text, so a resumed
  run always finds one current note, not a history to reconcile.
- If you get stuck or run low on budget without having hit either trigger
  yet, checkpoint anyway before stopping, same file and commit subject.
  Skip checkpointing only if you truly have nothing a resumed run would
  need (e.g. you finished the task or haven't started exploring yet).

# Done

Before finishing, write a PR description (what changed and why, per this
repo's commit-message convention) wrapped in a `<pr_description>` tag, e.g.:

```
<pr_description>
One paragraph summary of the change and why it was needed.
</pr_description>
```

Then output `<promise>COMPLETE</promise>` to signal you're done.
