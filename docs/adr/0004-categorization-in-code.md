# ADR 0004: Categorization and rule checks in TypeScript

## Status

Accepted

## Context

After ADR 0002 moved account-number matching to TypeScript, the LLM analyst still received the three reconciled buckets and was responsible for:

1. Categorizing matched pairs into covered / missingStatement / notFilledIn
2. Applying field-to-field amount mapping (e.g. "dividendbelasting" → `broker.dutchDividendTax`)
3. Evaluating deterministic rules (aflossingsvrij hypotheek, buitenlands dividend, box 3 threshold)

These were expressed as prose instructions in the system prompt. Silent misclassifications and missed rule hits were discoverable only through manual inspection, not tests.

## Decision

Categorization and deterministic rule checks move to TypeScript:

- `lib/categorizer.ts` (`categorize()`) — maps matched pairs to covered items or amount mismatches using a `FIELD_AMOUNT_OVERRIDES` lookup table for field-to-field amount resolution. A ±€1 tolerance determines covered vs mismatch. Unmatched aangifte entries become missingStatement; unmatched jaaropgave accounts become notFilledIn.
- `lib/rule-checks.ts` (`runRuleChecks()`) — generates deterministic attention points from jaaropgave metadata: `metadata.mortgageType === "aflossingsvrij"`, presence of `broker.foreignDividend` or `foreignWithholdingTax`, and cumulative box 3 balance vs a per-year `HEFFINGSVRIJ_VERMOGEN` table.

The LLM analyst now receives only amount mismatches and annual statements for context. It generates attention points for non-deterministic issues and judges whether mismatches are real errors vs lifecycle events (partial-year interest, mid-year account changes). The system prompt explicitly names which checks have already been run and must not be re-flagged.

Rule-check attention points are prepended to LLM-generated points so deterministic findings always appear first.

## Alternatives considered

- **Keep categorization in the LLM prompt** — already producing silent misclassifications; no executable test surface.
- **Move field mapping to extraction schemas** — would widen extracted types and still leave categorization logic in prose.

## Consequences

- Categorization and field-to-field mapping are unit-testable
- Rule checks are unit-testable with known jaaropgave fixtures
- LLM context window for analysis is smaller — only mismatches + statements, not full matched buckets
- Adding a new field-to-field mapping requires a code change to `FIELD_AMOUNT_OVERRIDES` in `lib/categorizer.ts`
- The LLM's scope is narrowed: mismatch judgment and open-ended attention points not covered by rule checks
