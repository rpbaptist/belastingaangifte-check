## Agent skills

### Issue tracker

Issues live in GitHub Issues on `rpbaptist/belastingaangifte-check`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Dev workflow

For all new features and changes:

- Use `grill-with-docs` skill before doing anything. Claude Code's built-in plan
  mode is not a substitute, even if it produced a design doc or a plan file —
  run `grill-with-docs` explicitly regardless of whether plan mode was used.
- Record my prompts
- Create an artifact for the resulting plan from step 1.
- Record the plan as an issue in markdown, with an `Artifact:` link at the top.
- Create a GitHub issue with the plan.
- Implement new issues on a new worktree.
- When changing or adding new functionality, use `tdd` skill.
- Before committing, use `qa` skill
- Create logically grouped, atomic commits.
- Update documentation according to changes made.
- Create a PR and review it. Concise, only comment when something requires attention and is actionable.
- Address small review issues directly. If larger or makes sense to follow up, create a new GitHub issues.

Default to continuing to the next step unless instructed otherwise.

### Commit style

1. Limit the subject line to 70 characters
2. Separate subject from body with a blank line
3. Capitalize the subject line
4. Do not end the subject line with a period
5. Use the imperative mood in the subject line
6. Use the body to explain what and why vs. how

### Code style

- React components only render. Should not contain logic.
- Route handlers (`app/api/*/route.ts`) delegate. Parse the request, call into
  `src/*`, map the result to a response. Business logic, validation, and
  error-to-status-code mapping belong in `src/*` where they're unit-testable, not
  inline in the route file.
- All DB writes go through `src/repositories/*`. No raw SQL with interpolated
  table/column names outside a repository class.
- Client components import and reuse server-defined types from `src/repositories/*`
  (or wherever the type is defined) instead of hand-declaring a parallel local
  `interface` for the same shape.
- When one type is asked to represent two structurally different cases (e.g. a
  legacy-imported record vs. a new-flow one), prefer a discriminated union over a
  single type where half the fields are `| null` depending on which case you're in.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
