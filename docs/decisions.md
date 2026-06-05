# Architecture Decisions

Decisions made during project design, with reasoning. Reference this when resuming work or reviewing scope.

---

## 1. PDFs sent as native Claude document blocks

**Decision:** Base64-encode PDFs and send them as `{ type: "document", source: { type: "base64", media_type: "application/pdf" } }` blocks directly to the Anthropic API.

**Why:** Dutch tax PDFs (aangifte, jaaropgaves) contain tables and structured layouts that matter for correct parsing. Pre-extracting with `pdf-parse` loses this context. Claude's native PDF understanding handles the structure better. Token cost is justified — this is not a high-volume production service.

**Alternative rejected:** Server-side text extraction with `pdf-parse` before sending to Claude.

---

## 2. LLM determines institution type automatically

**Decision:** Claude infers `institutionType` ("bank" | "broker" | "mortgage" | "other") from PDF content during extraction. The user does not select it on upload.

**Why:** Cleaner UX. Institution type is clearly identifiable from the document (ING jaaropgave, DEGIRO jaaropgave, etc.). Manual selection adds friction with little benefit.

**Alternative rejected:** User selects institution type per uploaded jaaropgave.

---

## 3. Matching done in TypeScript (reconciliation), not by the LLM

**Decision:** Account number matching is done in code before the LLM analyst is called. See [ADR 0002](adr/0002-js-side-account-matching.md) for full reasoning.

The matching pipeline lives in `lib/reconciler.ts` and runs two passes:

1. **Primary** — pair aangifte entries to jaaropgave accounts by normalised account number (`primaryMatch`).
2. **Secondary** — for entries without an account number (wage income, AO insurance premiums), match by amount against known jaaropgave fields. Also filters out calculated fields (e.g. Eigenwoningforfait) that never have a corresponding jaaropgave (`secondaryMatch`).

The analyst receives three pre-labelled buckets. Categorization (covered / missing / notFilledIn) is done in TypeScript by `lib/categorizer.ts` before the LLM is called. See decision 11.

**Original decision (LLM matching) rejected** after three silent false flags discovered through manual inspection with no failing tests. See ADR 0002.

---

## 4. Amount comparison uses ±€1 tolerance

**Decision:** When comparing a matched aangifte amount to its jaaropgave counterpart, classify the pair as covered if `Math.abs(aangifte - statement) <= 1`. Larger differences surface as amount mismatches for the LLM to review.

**Why:** The Belastingdienst always rounds aangifte amounts to full euros. Jaaropgaves may show cents. After rounding the jaaropgave amount, a residual ±€1 difference can remain depending on how each institution rounds (e.g. banker's rounding vs truncation). The ±€1 band absorbs this without masking meaningful mismatches.

**Implementation:** Applied in `lib/categorizer.ts` for covered/mismatch classification, and in `lib/reconciler.ts` for secondary amount-based matching.

---

## 5. Two separate upload zones (aangifte vs jaaropgaves)

**Decision:** The UI has two distinct drop zones: one for the belastingaangifte, one for one or more jaaropgaves.

**Why:** The aangifte is structurally unique (Belastingdienst format) and serves as the source of truth. Misclassifying it would silently corrupt the entire report. Explicit separation makes the roles clear to the user and eliminates ambiguity.

**Alternative rejected:** Single drop zone with LLM determining which document is which.

---

## 6. Parallel extraction with `Promise.all`

**Decision:** The aangifte and all jaaropgaves are extracted in parallel using `Promise.all`.

**Why:** Each extraction is independent. Serial extraction would be N × latency. `Promise.all` reduces wall-clock time to roughly max(individual extraction times). Prompt caching on the system prompt further reduces cost on the parallel calls.

**Partial failure handling:** If one jaaropgave extraction fails, the others continue. See decision 10.

---

## 7. Single `/api/analyze` route, no streaming

**Decision:** One API endpoint receives all PDFs and returns the complete report. No streaming, no intermediate endpoint.

**Why:** Server-side orchestration is cleaner to read and reason about. A spinner with "documenten worden geanalyseerd..." is sufficient UX for a portfolio piece. Streaming adds client complexity for marginal UX gain.

**Alternatives rejected:**

- Two routes (`/api/extract` + `/api/analyze`) requiring two client calls
- SSE/streaming response

---

## 8. Request body size limit raised to 20 MB

**Decision:** `bodySizeLimit: "20mb"` set in the Next.js route config.

**Why:** Vercel serverless functions default to a 4.5 MB body limit. An aangifte PDF plus 4–5 jaaropgaves easily exceeds this. A typical aangifte is 1–3 MB; jaaropgaves are small. 20 MB covers all realistic cases with no extra infrastructure.

**Alternative rejected:** Upload PDFs to Vercel Blob/S3 and pass URLs to the API (unnecessary infrastructure for a single-user tool).

---

## 9. Hybrid aandachtspunten: seeded rules + open LLM judgment

**Decision:** The analyst prompt includes a seeded list of known tax flags (from `rules/aandachtspunten.md`) plus an instruction to flag anything else a Dutch tax expert would consider notable.

**Why:** The known patterns (aflossingsvrij hypotheek, buitenlands dividend, box 3 drempel) are the most valuable signals — leaving them to open-ended LLM judgment risks omission. But open-ended judgment catches edge cases the rules don't anticipate.

**Rules stored in Markdown:** See [ADR 0001](adr/0001-aandachtspunten-rules-in-markdown.md) for the reasoning behind file-based rules vs. hardcoded strings.

---

## 10. Partial success on jaaropgave extraction failure

**Decision:** If one jaaropgave PDF fails extraction, the others succeed and the report is generated without the failed document. The failed file is reported back to the user by name.

**Why:** Failing the entire request because one PDF is unreadable (scanned image, corrupted file) is poor UX. The user may have 3 valid jaaropgaves and one bad scan. Partial results with a clear warning are more useful than an opaque failure.

**What gets reported:** `report.extractionErrors` contains `{ filename, error }` for each failed extraction.

---

## 11. Categorization and rule checks moved from LLM to TypeScript

**Decision:** The LLM analyst no longer categorizes the reconciliation output or evaluates deterministic rules. Two TypeScript steps replace this:

1. `lib/categorizer.ts` (`categorize()`) — maps matched/unmatched buckets to covered, missingStatement, notFilledIn, and amountMismatches. Field-to-field amount mapping (e.g. aangifte "dividendbelasting" → jaaropgave `broker.dutchDividendTax`) is handled by a `FIELD_AMOUNT_OVERRIDES` lookup table.

2. `lib/rule-checks.ts` (`runRuleChecks()`) — generates deterministic attention points from jaaropgave metadata: aflossingsvrij hypotheek, buitenlands dividend, and box 3 threshold check. These are prepended to LLM-generated attention points.

The LLM analyst now receives only amount mismatches and annual statements for context, and generates open-ended attention points for non-deterministic issues. The analyst prompt explicitly names which checks have already been run by code and must not be re-flagged. See [ADR 0004](adr/0004-categorization-in-code.md).

**Why:** Categorization and field-mapping were fragile as free-text LLM instructions. Silent misclassifications were discoverable only through manual inspection. Moving to TypeScript makes every rule a unit test.

**Consequences:**

- Categorization, field-to-field mapping, and most attention point rules are unit-testable
- LLM context window for analysis is smaller — only mismatches + statements, not full matched buckets
- New field-to-field mappings require a code change to `FIELD_AMOUNT_OVERRIDES`
- The LLM's remaining scope: judging whether amount mismatches are real errors vs lifecycle events, and open-ended attention points not covered by rule checks
