# ADR 0002: JS-side account number matching

## Status

Accepted

## Context

Matching aangifte entries to jaaropgave accounts by rekeningnummer was delegated to the analyser LLM via prose rules in the system prompt ("strip whitespace and punctuation, strip Nummer prefix, compare case-insensitively"). Three false flags were discovered through manual inspection rather than tests, because the matching logic had no executable form. Changes to matching rules required editing system prompt strings with no way to verify correctness.

## Decision

Account number matching is done in code before the LLM is called:

- `lib/account-normalizer.ts` — `normalize(raw: string): string` reduces any rekeningnummer to a canonical lowercase form (strips whitespace, punctuation, and Dutch label prefixes)
- `lib/account-matcher.ts` — `matchEntries(taxReturn, statements)` pairs aangifte entries to jaaropgave accounts by normalised rekeningnummer, returning matched pairs and unmatched entries on both sides
- `lib/aangifte-exceptions.ts` — second pass: filters calculated fields (e.g. Eigenwoningforfait) that never have a jaaropgave, and secondary-matches entries without a rekeningnummer (wage income, AO insurance premiums) by amount
- `lib/koppeling.ts` — `koppeling(taxReturn, statements)` runs both passes and returns the final three buckets; the single entry point callers use
- `lib/analyzer.ts` — calls `koppeling` before the API call and sends the pre-matched structure to the LLM; matching prose removed from the system prompt

The LLM receives three pre-labelled buckets and focuses on amount comparison and aandachtspunten.

## Alternatives considered

- **Keep LLM matching, add JS normalize as documentation** — normalize() would exist as tested code but not drive any runtime behaviour. Matching would still fail silently when rules drift.
- **Normalize field in extracted types** — add `normalizedAccountNumber` alongside `accountNumber`. Avoids changing the analyser interface but widens all data types and still leaves matching to the LLM.

## Consequences

- Every normalisation edge case is a unit test, not a manual inspection
- Adding a new normalisation rule is a code change + test, not a prompt edit
- The analyser prompt is shorter and the LLM does less rule-following
- Original formatted account numbers are preserved in all displayed output
- A future extraction type must implement its account numbers as plain strings for `normalize` to handle
