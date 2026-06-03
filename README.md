# Belastingaangifte Checker

A tool that helps Dutch taxpayers verify their tax return is complete and correct by cross-referencing their tax return (_belastingaangifte_) against annual statements (_jaaropgaves_) from banks, brokers, and mortgage providers.

> **Portfolio project.** Built to demonstrate fullstack AI product engineering with TypeScript, Next.js, and the Anthropic API.

**Live demo: [aangiftecheck.nl](https://www.aangiftecheck.nl)** — bring your own Anthropic API key.

## What it does

1. Upload your tax return PDF (the _belastingaangifte_ from Belastingdienst)
2. Upload one or more annual statements (_jaaropgaves_) — ING, ASN, DEGIRO, mortgage provider, etc.
3. Claude extracts structured data from all documents
4. The tool compares them and produces a report

### Report categories

|     | Category                      | Meaning                                                                       |
| --- | ----------------------------- | ----------------------------------------------------------------------------- |
| ✅  | **Gedekt**                    | Item in both tax return and annual statement, amounts match                   |
| ⚠️  | **Jaaropgave ontbreekt**      | Item in tax return but no matching annual statement uploaded                  |
| 📝  | **Niet ingevuld in aangifte** | Annual statement uploaded but item missing or zero in tax return              |
| 💡  | **Aandachtspunten**           | Substantive flags — e.g. interest-only mortgage, foreign dividend withholding |

You can also add annual statements after the initial analysis and ask follow-up questions about any flag.

## Tech stack

- **Next.js 16** (App Router)
- **TypeScript**, **Zod**
- **Anthropic API** — `claude-haiku-4-5` for PDF extraction, `claude-sonnet-4-6` for analysis
- **Tailwind CSS**

## How the AI works

Three steps, the first two in parallel:

1. **Extraction** — Each PDF is sent as a native document block to Claude Haiku. Claude identifies the institution type (bank, broker, mortgage), extracts account numbers and relevant amounts, and returns structured JSON validated against a Zod schema. Parallel calls with prompt caching minimise latency and cost.

2. **Matching** — Account numbers from the tax return and annual statements are matched in code using a normalisation function that strips whitespace, punctuation, and Dutch label prefixes (e.g. `Nummer`). No LLM involved — it's deterministic and tested.

3. **Analysis** — Claude Sonnet receives the pre-matched pairs and produces the four-category report. Flags (_aandachtspunten_) are generated from a [seeded rule set](rules/aandachtspunten.md) plus open-ended LLM judgment.

## API key

This tool calls the Anthropic API directly from your browser using your own API key — no backend stores your key or your documents.

**When using the hosted version:** enter your Anthropic API key in the field at the top of the page. It is kept in `sessionStorage` for the duration of your browser session and never sent anywhere except directly to `api.anthropic.com`.

**When running locally:** set `NEXT_PUBLIC_DEV_API_KEY` to skip entering the key in the UI on every reload:

```bash
# with mise (recommended)
mise set NEXT_PUBLIC_DEV_API_KEY=sk-ant-...

# or with a .env.local file
echo "NEXT_PUBLIC_DEV_API_KEY=sk-ant-..." > .env.local
```

Get an API key at [console.anthropic.com](https://console.anthropic.com/).

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter your API key, and upload your documents.

## Extending the tax flag rules

Tax flags are stored in plain Markdown — no code change needed:

```
rules/aandachtspunten.md
```

Add a new rule section describing the condition and its tax implication. It will be included in the analyst prompt on the next request.

## Project structure

```
app/
  page.tsx                        — upload UI and report view
  api/
    analyze/route.ts              — full analysis: PDFs in, report out
    analyze/incremental/route.ts  — add annual statements to an existing analysis
    question/route.ts             — follow-up Q&A on flagged items
lib/
  types.ts                        — shared TypeScript types
  schemas.ts                      — Zod schemas for LLM output validation
  extractor.ts                    — PDF extraction via Claude Haiku
  extraction-session.ts           — parallel extraction orchestration
  extraction-cache.ts             — dev-only disk cache (keyed by PDF hash)
  account-normalizer.ts           — account number normalisation
  account-matcher.ts              — JS-side tax return ↔ annual statement matching
  analyzer.ts                     — comparison report via Claude Sonnet
  parse-llm-json.ts               — shared JSON parser with Dutch error messages
rules/
  aandachtspunten.md              — editable tax flag rules
docs/
  adr/                            — architectural decision records
  agents/                         — agent tooling config (issue tracker, labels)
```
