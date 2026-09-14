# ADR 0008: Validation reports; callers mutate

Extraction hardening needs a deterministic check between Zod parse and the cache write.
We considered a validator that returns corrected data alongside its findings, and chose
one that only reports: rules may _propose_ a change as data on the issue (`before` /
`after`), but applying it is an explicit named transform the caller invokes. Silent
correction is the failure mode we are trying to remove, not a tool we want to reach for.

## Considered options

- **Validator returns corrected data** (as specified in issue #98). A deeper module with
  one call site, mitigated by a `fixed | warning | error` severity and a before/after
  audit trail. Rejected: `dedupeBy` in `lib/categorizer.ts` is already this pattern — a
  cleanup step that silently changed the result — and it dropped a real ASN Themabeleggen
  position from the report without any test noticing. Better bookkeeping does not fix an
  invisible mutation; only a visible one does.
- **Validator reports only, no proposals.** Rejected as too thin: the rule that detects a
  problem usually knows the correction, and throwing that away pushes the logic to the
  call site twice.

## Consequences

- Every value change is visible in `lib/extractor.ts` and individually unit-testable.
- The caller composes a few named transforms rather than making one call.
- Issue #98's `ValidationResult<T>` shape survives; its `data` field becomes the input,
  unmodified, and corrections travel on the issues.
