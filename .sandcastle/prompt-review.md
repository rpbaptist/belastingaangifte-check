# Context

You are reviewing PR #{{PR_NUMBER}} (for issue #{{ISSUE_NUMBER}}), which you
(a prior iteration) just opened. You are on the same branch, inside a fresh
sandbox — the worktree has your prior commits already.

!`cat AGENTS.md`

# Diff under review

{{PR_DIFF}}

# Pending comments on this PR

{{PENDING_COMMENTS}}

These are comments left since your last review pass (or, if this is the
first pass, all comments so far) — a mix of your own prior findings and
anything a human reviewer added. If this section says "(none)", skip this
part entirely.

For each pending comment that isn't already marked as something you
yourself resolved:

- If it asks for a change: make it (fix + commit), same rules as below.
- If it asks a question or raises a concern you can resolve by
  investigating: investigate, then address it in your `comments` output.
- If it's out of scope for this PR: don't fix it — file it via `newIssues`
  instead, same as any other larger finding.

# Task

Review this diff against the coding standards and workflow in `AGENTS.md`
above — the same checklist a human `code-review` pass would apply (route
handlers delegate, DB writes through repositories, components only render,
discriminated unions over dual-null shapes, etc.) plus general correctness.

- **Small issues** (typos, a missed edge case, a style violation, a weak
  test): fix them directly. Commit the fix (atomic, imperative subject
  line). Re-run the full test suite and `fallow audit` after any fix —
  both must still pass.
- **Larger issues** (design disagreement, missing scope, something that
  deserves its own discussion): do NOT fix inline. Describe it as a new
  issue instead — do not touch the code for it.
- If the diff looks correct as-is, say so. Don't invent findings to seem
  thorough.

# Currently open issues

{{OPEN_ISSUES}}

Before filing anything via `newIssues`, check this list. If an open issue
already substantially covers the same finding, do NOT file a duplicate —
reference the existing issue number in your `comments` output instead
("already tracked as #N"). Only add to `newIssues` when nothing open
already covers it.

# Done

Output your findings wrapped in a `<review_result>` tag as JSON matching
this shape:

```
<review_result>
{
  "summary": "one paragraph: overall assessment",
  "comments": ["finding 1 (what you found, what you did about it)", "..."],
  "newIssues": [{"title": "...", "body": "..."}]
}
</review_result>
```

Per `AGENTS.md`: only add a comment for something that may require action —
a fix you made, a risk worth flagging, a genuine judgment call. Do not add
a comment just to confirm something was checked and found fine ("verified
X, no change needed") — that's noise, not a finding. If everything you
looked at was already correct, `comments` should be empty and `summary`
alone should say so. `newIssues` is only for things deliberately left
unfixed. Both arrays may be empty — an empty `comments` array on a clean
diff is the expected, correct output, not a failure to find something.

Then output `<promise>COMPLETE</promise>`.
