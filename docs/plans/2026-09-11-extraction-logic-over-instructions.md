# Extraction logic over instructions

Date: 2026-09-11
Status: proposed
Companion: #96 (tax-pdf-parser pre-process)

## Context

`lib/extractor.ts` sends each PDF as a native document block to
`claude-haiku-4-5-20251001`, then `parseLlmJson` + Zod parse + dev cache
write. No business-rule check exists between schema parse and cache.

Prompts carry brittle heuristics:

- `lib/prompts/annual-statement.ts` (~57 lines): IBAN 18-char re-read rule,
  DEGIRO exactly-two-accounts hack, 1-januari vs 31-december balance date,
  broker cash+portfolio same-entry rule, wage/AO synonym lists, dividend
  semantics, sign preservation.
- `lib/prompts/tax-return.ts` (~25 lines): IBAN reconstruction across line
  breaks, DEGIRO multi-column concat, mortgage Nummer pattern, wage
  per-employer split, completeness rule.

Failure mode: Extraction maps a value to the wrong field key (for example
`dutchDividendTax` vs `foreignWithholdingTax`, cash vs portfolio). Wrong
keys then mismatch downstream in Reconciliation (`lib/reconciler.ts`) and
Categorization (`lib/categorizer.ts`, `FIELD_AMOUNT_OVERRIDES` in
`lib/field-mapping.ts`). Fix belongs before Reconciliation, not in it.

Trajectory: ADR 0002 moved account matching to code, ADR 0004 moved
categorization and rule checks to code. Extraction prompts are next.

## Glossary gap

`CONTEXT.md` defines Extraction, Reconciliation, Categorization, Analysis.
It names no post-schema deterministic check. Proposed term on
implementation: **Validation** — deterministic check of extracted data
after Zod parse (IBAN checksum, sign, taxYear plausibility, balance-date
filtering, broker merge). Distinct from Reconciliation and Categorization.
Update `CONTEXT.md` inline when implemented.

## Decision

Add pure post-extraction Validation layer. Slim prompts to field
definitions only. Single targeted self-correction retry in `extractor.ts`.

Interface (synthesis of 3 design-an-interface options: deep 2-method,
pluggable pipeline, happy-path optimized — hybrid adopted):

```ts
// lib/extraction-validator.ts — pure, no Anthropic import
type IssueCode =
  | "iban.length" | "iban.checksum"
  | "taxYear.implausible"
  | "balance.endOfYear"
  | "broker.split" | "amount.sign"
  | "duplicate.account" | "field.unknown";
interface Issue {
  code: IssueCode;
  severity: "fixed" | "warning" | "error";
  path: string;
  message: string;
  retryable: boolean;
  before?: unknown;
  after?: unknown;
}
interface ValidationResult<T> {
  data: T;
  issues: Issue[];
  retry: { hint: string; paths: string[] } | null;
  ok: boolean;
}
export function validateAnnualStatement(
  d: AnnualStatementData
): ValidationResult<AnnualStatementData>;
export function validateTaxReturn(d: TaxReturnData): ValidationResult<TaxReturnData>;
```

Hidden rule groups (ordered normalize, validate, correct): IBAN
normalize + MOD97 (reuse `lib/account-normalizer.ts`), taxYear window,
balance-date filter (reuse `categorize.isEndOfYearAccount`), broker
cash/portfolio split-merge, amount sign/rounding, duplicate detection,
synonym-key remap. Retry orchestration stays in `lib/extractor.ts`
(owns `withRetry` and cache policy). Internally a private `Rule[]`
registry; no per-rule public API until rule count exceeds ~10.

`extract()` change: after `schema.parse`, validate. If `retry` non-null,
one targeted retry (PDF + `Previous extraction failed validation: <hint>`),
re-parse, re-validate. Cache only validated data. `withRetry` stays for
429/5xx only.

Orthogonal to #96: when parser active, markdown path feeds the same
validator. Cache stays keyed on PDF hash either way.

## Build steps (vertical slices)

1. Validator skeleton + IBAN/taxYear/balance-date rules + unit tests
   (fixtures from `.extracted/` stripped of PII). No LLM mocks.
2. Broker/wage synonym + amount-sign rules + prompt slimming pass 1
   (remove IBAN/balance-date/DEGIRO instructions, keep semantic
   definitions).
3. Retry orchestration in `lib/extractor.ts`; update `CONTEXT.md`
   (Validation entry) and `docs/decisions.md`.
4. Evaluation harness: golden fixtures for 6 provider types (ING, ASN,
   DEGIRO/flatex, employer NL/EN, mortgage); regression gate on
   `npm test`; manual spot-check on 2 unseen PDFs.

## Out of scope

Lambda itself (#96), OCR, Analysis prompt changes, hosted vector DB swap.

## Verification

- `npm test` passes; new validator tests green.
- Fixture tests assert corrected `data` equals golden; `issues` audit
  trail reviewed.
- Induced validation error triggers one retry then recovers; persistent
  error surfaces via `formatExtractionFailed`.
- `app/api/analyze` multipart contract unchanged (ADR 0005).
- `npm run check:fallow` clean before commit.

## Risks

- Over-correction silencing real mismatch: mitigate via
  fixed/warning/error severity + before/after audit.
- Retry cost: capped at 1, only on error + retryable.
- Prompt slimming regresses unseen layout: mitigate with harness, keep
  fallback document-block path.

## ADR note

No contradiction with ADR 0002/0004 (extends them). Flag to reopen
ADR 0003 (Haiku for Extraction): markdown path via parser may change the
cost/quality tradeoff; re-evaluate model choice after harness.
