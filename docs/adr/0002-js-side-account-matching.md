# ADR 0002: JS-side account number matching

## Status

Accepted

## Context

Matching aangifte entries to jaaropgave accounts by rekeningnummer was delegated to the analyser LLM via prose rules in the system prompt ("strip whitespace and punctuation, strip Nummer prefix, compare case-insensitively"). Three false flags were discovered through manual inspection rather than tests, because the matching logic had no executable form. Changes to matching rules required editing system prompt strings with no way to verify correctness.

## Decision

Account number matching is done in code before the LLM is called:

- `lib/account-normalizer.ts` — `normalize(raw: string): string` reduces any rekeningnummer to a canonical lowercase form (strips whitespace, punctuation, and Dutch label prefixes)
- `lib/reconciler.ts` — `reconcile(taxReturn, statements)` consolidates all matching logic and returns three buckets. Internally runs two passes: `primaryMatch` (by normalised rekeningnummer) and `secondaryMatch` (by amount for entries without a rekeningnummer, e.g. wage income, AO insurance premiums; also removes calculated fields like Eigenwoningforfait that never have a jaaropgave)
- `lib/analyzer.ts` — calls `reconcile` then `categorize` before the API call; matching and categorization prose removed from the system prompt

The LLM receives only amount mismatches and annual statements for context. See [ADR 0004](0004-categorization-in-code.md) for the subsequent move of categorization from LLM to code.

## Alternatives considered

- **Keep LLM matching, add JS normalize as documentation** — normalize() would exist as tested code but not drive any runtime behaviour. Matching would still fail silently when rules drift.
- **Normalize field in extracted types** — add `normalizedAccountNumber` alongside `accountNumber`. Avoids changing the analyser interface but widens all data types and still leaves matching to the LLM.

## Consequences

- Every normalisation edge case is a unit test, not a manual inspection
- Adding a new normalisation rule is a code change + test, not a prompt edit
- The analyser prompt is shorter and the LLM does less rule-following
- Original formatted account numbers are preserved in all displayed output
- A future extraction type must implement its account numbers as plain strings for `normalize` to handle
