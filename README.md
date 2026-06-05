# Belastingaangifte Checker

> Cross-reference your Dutch tax return against your bank, broker, and mortgage statements in seconds.

[![Vercel](https://img.shields.io/github/deployments/rpbaptist/belastingaangifte-check/Production?logo=vercel&label=Vercel)](https://www.aangiftecheck.nl)

**[→ Live demo at aangiftecheck.nl](https://www.aangiftecheck.nl)** — bring your own Anthropic API key.

---

Upload your tax return (_belastingaangifte_) and annual statements (_jaaropgaves_). Claude reads all the PDFs, extracts the numbers, and tells you what matches, what's missing, and what deserves a closer look.

## Report

| | Category | Meaning |
|---|---|---|
| ✅ | **Gedekt** | In both tax return and annual statement — amounts match |
| ⚠️ | **Jaaropgave ontbreekt** | In tax return but no annual statement uploaded |
| 📝 | **Niet ingevuld in aangifte** | Annual statement present but missing or zero in tax return |
| 💡 | **Aandachtspunten** | Substantive flags — interest-only mortgage, foreign dividend withholding, etc. |

After the initial report you can add more statements incrementally and ask follow-up questions about any flag.

## How it works

Three steps:

```
PDFs → [Extraction] → [Reconciliation] → [Analysis] → Report
            ↑                ↑               ↑
       Claude Haiku     TypeScript      Claude Sonnet
       (parallel)        (tested)
```

**Extraction** — Each PDF is sent as a native document block to Claude Haiku, which returns structured JSON (institution type, account numbers, amounts). Runs in parallel across all uploaded files with prompt caching.

**Reconciliation** — Account identifiers from the tax return and annual statements are matched in TypeScript (`lib/reconciler.ts`). Primary matching by normalised account number (strips whitespace, punctuation, Dutch label prefixes). Secondary matching by amount for entries without an account number (wage income, insurance premiums). Deterministic, no LLM.

**Analysis** — Claude Sonnet receives the pre-matched pairs and produces the report. Flags are generated from a [seeded rule set](rules/aandachtspunten.md) plus open-ended LLM judgment.

## Cost per run

Typical run: 1 aangifte + 4 jaaropgaves.

| Call | Model | Approx. tokens | Approx. cost |
|---|---|---|---|
| 5 × extraction (parallel) | Haiku 4.5 | ~16k input / ~2.2k output | ~$0.02 |
| 1 × analysis | Sonnet 4.6 | ~3.3k input / ~650 output | ~$0.02 |
| **Total** | | | **~$0.04** |

Token counts are dominated by PDF text size — a large aangifte or many jaaropgaves will increase the extraction cost linearly. Analysis cost grows with the number of matched/unmatched accounts. Prompt caching on the shared jaaropgave system prompt reduces extraction cost when the cache is warm.

Prices are approximate; verify current rates at [console.anthropic.com](https://console.anthropic.com/).

## API key

The key is passed through the Next.js API route to Anthropic and is not stored server-side. It is held in `sessionStorage` for the duration of the session.

Get a key at [console.anthropic.com](https://console.anthropic.com/).

## Running locally

```bash
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000) and enter your API key when prompted.

To skip the key prompt on every reload, set `NEXT_PUBLIC_ANTHROPIC_API_KEY`:

```bash
mise set NEXT_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...   # or add to .env.local
```

## Extending the tax flag rules

Flags are defined in plain Markdown — no code change or redeploy needed:

```
rules/aandachtspunten.md
```

Add a rule section with the condition and its tax implication. It is injected into the analyst prompt on the next request.

## Stack

[Next.js 16](https://nextjs.org) · [TypeScript](https://typescriptlang.org) · [Zod](https://zod.dev) · [Tailwind CSS](https://tailwindcss.com) · [Anthropic API](https://anthropic.com)

## Project structure

```
app/
  page.tsx                        UI — upload, report, Q&A
  components/DropZone.tsx         file drop / pick component
  components/ReportSections.tsx   summary boxes + comparison section components
  api/analyze/route.ts            full analysis endpoint
  api/analyze/incremental/        add statements to existing analysis
  api/question/                   follow-up Q&A on flagged items
lib/
  extractor.ts                    PDF → JSON via Claude Haiku
  extraction-session.ts           parallel orchestration + partial failure handling
  extraction-cache.ts             dev-only cache (SHA-256 keyed)
  account-normalizer.ts           strip whitespace / prefixes from account numbers
  reconciler.ts                   full matching pipeline: primary IBAN match + secondary
                                  amount match + calculated-field removal
  analyzer.ts                     comparison report via Claude Sonnet
  anthropic-error.ts              Anthropic SDK error classification
  schemas.ts                      Zod schemas for all LLM output
  parse-llm-json.ts               shared JSON parser
rules/
  aandachtspunten.md              editable tax flag rules
docs/adr/                         architectural decision records
```
