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
PDFs → [Extraction] → [Matching] → [Analysis] → Report
            ↑               ↑            ↑
       Claude Haiku      TypeScript  Claude Sonnet
       (parallel)        (tested)
```

**Extraction** — Each PDF is sent as a native document block to Claude Haiku, which returns structured JSON (institution type, account numbers, amounts). Runs in parallel across all uploaded files with prompt caching.

**Matching** — Account numbers from the tax return and annual statements are paired in TypeScript using a normalisation function that strips whitespace, punctuation, and Dutch label prefixes. Deterministic, no LLM.

**Analysis** — Claude Sonnet receives the pre-matched pairs and produces the report. Flags are generated from a [seeded rule set](rules/aandachtspunten.md) plus open-ended LLM judgment.

## API key

Your key never touches the server. The app calls `api.anthropic.com` directly from your browser and stores the key in `sessionStorage` for the duration of the session.

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
  api/analyze/route.ts            full analysis endpoint
  api/analyze/incremental/        add statements to existing analysis
  api/question/                   follow-up Q&A on flagged items
lib/
  extractor.ts                    PDF → JSON via Claude Haiku
  extraction-session.ts           parallel orchestration
  extraction-cache.ts             dev-only cache (SHA-256 keyed)
  account-normalizer.ts           strip whitespace / prefixes from account numbers
  account-matcher.ts              tax return ↔ annual statement matching
  analyzer.ts                     comparison report via Claude Sonnet
  schemas.ts                      Zod schemas for all LLM output
  parse-llm-json.ts               shared JSON parser
rules/
  aandachtspunten.md              editable tax flag rules
docs/adr/                         architectural decision records
```
