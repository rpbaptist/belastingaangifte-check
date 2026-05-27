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

## 3. LLM analyst handles matching; account number is the primary key

**Decision:** A second LLM call (the analyst) receives all extracted data and determines which jaaropgave entries correspond to which aangifte entries. Matching is primarily by account number (IBAN).

**Why:** Aangifte entries rarely name the institution explicitly. Programmatic matching rules (by institution name, by field label) are fragile. The analyst can reason about context and edge cases. Account numbers are the natural shared identifier between both document types.

**Alternatives rejected:**

- Match by institution name (too fragile)
- Match by field/category type (ambiguous with multiple accounts of same type)
- Deterministic TypeScript matching logic (can't handle edge cases)

---

## 4. Amount comparison rounds both sides to full euros, then exact match

**Decision:** Before comparing amounts, round jaaropgave amounts to the nearest full euro. Then require exact match.

**Why:** The Belastingdienst always rounds amounts in the aangifte to full euros. Jaaropgaves may show cents. Rounding before comparison prevents false mismatches. A tolerance band (±€1) is unnecessary once both sides are rounded.

**No tolerance band needed:** Rounding is deterministic — both sides should land on the same integer after rounding.

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
