# Extraction logic over instructions

Date: 2026-09-11
Status: revised after grilling session
Tracking: #98. Related: #99 (dedupe regression), #96 (parser — rejected via #97)

## Context

`lib/extractor.ts` sends each PDF as a native document block to
`claude-haiku-4-5-20251001`, then `parseLlmJson` + Zod parse + dev cache write. No
business-rule check exists between schema parse and cache.

Prompts carry brittle heuristics with no executable test surface:
`lib/prompts/annual-statement.ts` (~57 lines) holds an IBAN 18-char re-read rule, a
DEGIRO exactly-two-accounts hack, the 1-januari vs 31-december balance date, broker
cash+portfolio, wage/AO synonym lists. `lib/prompts/tax-return.ts` (~25 lines) holds IBAN
reconstruction across line breaks and a mortgage Nummer pattern.

ADR 0002 moved account matching to code; ADR 0004 moved categorization and rule checks.
Extraction prompts are next.

**The parser premise is withdrawn.** PR #97 closed unmerged — the parser adds nothing when
a PDF lacks clearly defined tables. There is no markdown path.

## What measurement changed

`reconcile()` + `categorize()` replayed over the 11 cached extractions in `.extracted/`:

- Key-picking is correct on 10/10 jaaropgaves. The original failure hypothesis — wrong
  field keys — is not supported for that category. It fails on property documents (1/1),
  where no prompt vocabulary exists.
- ±1 amount gaps are **afronding**: the filer may round to whole euros in either
  direction. Not an extraction error, and not predictable.
- Duplicate-looking rows are distinct positions. `dedupeBy` discards one — 33 matched
  pairs become 32, and a real €134 holding leaves the report. Tracked as #99.

## Glossary

Added to `CONTEXT.md`: **Bewijsstuk** (umbrella for supporting documents, with jaaropgave
as one kind), **Notarisafrekening**, **WOZ-beschikking**, **Makelaarsnota**, **Afronding**.
**Institution** widened beyond financial institutions. **Rekeningnummer** narrowed to
account-bearing bewijsstukken. **Validation** enters as the deterministic check between
Zod parse and cache.

## Decisions

1. Validation **reports**; callers mutate — ADR 0008. Rules propose corrections on the
   issue (`before`/`after`); applying them is an explicit named transform. The
   corrected-`data` shape was rejected because `dedupeBy` is already that pattern.
2. **No self-correction retry.** Flag only. A flagged wrong IBAN beats a plausible
   fabrication produced under correction pressure.
3. **Afronding tolerance stays** at blanket ±1.
4. **Preserve cents** — `n()` stops rounding; `formatEuro` already truncates. Enables
   later tightening to `floor(exact) ≤ aangifte ≤ ceil(exact)`.
5. **Policy transforms run after cache read.** Cache holds the faithful extraction.
   Prompt hash folded into the cache key.
6. **Property bewijsstukken are in scope**, uploaded when a home was sold.
7. **Rekeningnummer keys account-bearing bewijsstukken only** — ADR 0002 amended. A
   notarisafrekening's only IBAN is a payment reference.
8. **`institutionType` is display-only.** Rabobank carries hypotheken under
   `institutionType: "bank"`; interpretation keys off each account's own kinds.
9. **Split contract, time-boxed.** Jaaropgaves keep model-chosen keys pending the eval;
   property documents get a closed kind union now.

## Build steps

1. Small fixes: `temperature: 0`; cents in `n()`; `isMidYearClosedMortgage` falls back to
   `openingDebt` when `remainingDebt === 0`; prompt hash in the cache key.
2. Eval harness — gates everything after. Coherent single-taxpayer synthetic set,
   absolutely-positioned HTML printed once via `chromium --headless=new --print-to-pdf`,
   PDFs committed. Never `<table>` — semantic tables produce a clean text layer that real
   bank PDFs lack, so such fixtures pass while real documents fail. Aangifte first.
   Anonymised JSON fixtures for the CI tier; real PDFs gitignored. Run against current
   code first for the before-number.
3. Policy to code, prompts slimmed: `selectAsOf()`, per-account broker interpretation,
   IBAN MOD97.
4. `lib/extraction-validator.ts` (reporting only) + issues section in the report.
5. Property bewijsstukken: closed kind union, own prompt, never in account matching.

## Out of scope

Parser Lambda (#96), OCR, Analysis prompt changes, hosted vector DB swap, Kennisbank
chunker (#93, #95). Eigenwoningreserve stays unmodelled.

## Verification

`npm test` green; fixture replay asserts bucket contents **and row counts** — #99 survived
a 513-line suite because nothing compared cardinality. `npm run eval:extraction` against
synthetic, then real PDFs. Multipart contract unchanged (ADR 0005). `npm run check:fallow`
clean.

## Risks

Prompt slimming regresses an unseen layout — mitigated by eval-first sequencing. Two
contracts coexist until the eval resolves the split. Synthetic fixtures cover only the
layouts deliberately encoded; the gitignored real-PDF tier catches the rest.

## Deferred

Observation contract for jaaropgaves (decided by step 2's number); tightening the afronding
tolerance; property identity matching via address or WOZ-objectnummer.

## ADR note

New ADR 0008. ADR 0002 amended. ADR 0003's reopening is withdrawn as originally framed —
revisit model choice on eval evidence, not on a parser that no longer exists.
