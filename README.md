# Belastingaangifte Checker

A tool that helps Dutch taxpayers verify their tax return is complete and correct by cross-referencing their belastingaangifte (tax return) against jaaropgaves (annual statements) from banks, brokers, and mortgage providers.

> **Portfolio project.** Built to demonstrate fullstack AI product engineering with TypeScript, Next.js, and the Anthropic API.

## What it does

1. Upload your belastingaangifte PDF (the tax return from Belastingdienst)
2. Upload one or more jaaropgaves (ING, ASN, DEGIRO, mortgage provider, etc.)
3. Claude extracts structured data from all documents
4. The tool compares them and produces a report

### Report categories

| | Category | Meaning |
|---|---|---|
| ✅ | **Gedekt** | Item in both aangifte and jaaropgave, amounts match |
| ⚠️ | **Jaaropgave ontbreekt** | Item in aangifte but no matching document uploaded |
| 📝 | **Niet ingevuld in aangifte** | Jaaropgave uploaded but item missing or zero in aangifte |
| 💡 | **Aandachtspunten** | Substantive flags — e.g. aflossingsvrij hypotheek, buitenlands dividend |

## Tech stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Anthropic API** — `claude-sonnet-4-6` for PDF extraction and analysis
- **Tailwind CSS**

## How the AI works

Two LLM passes:

1. **Extraction** — Each PDF is sent as a native document block to Claude. Claude identifies the institution type (bank, broker, mortgage), extracts account numbers and relevant amounts, and returns structured JSON. All extraction calls run in parallel with prompt caching to minimise latency and cost.

2. **Analysis** — A second call receives all extracted data and produces the four-category report. Matching is primarily by account number (IBAN). Aandachtspunten are generated from a [seeded rule set](rules/aandachtspunten.md) plus open-ended LLM judgment.

## Running locally

```bash
# Install dependencies
npm install

# Add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Extending the aandachtspunten rules

Tax flags are stored in plain Markdown — no code change needed:

```
rules/aandachtspunten.md
```

Add a new rule section, describe the condition and its tax implication, and it will be included in the analyst prompt on the next request.

## Project structure

```
app/
  page.tsx                  — upload UI
  api/analyze/route.ts      — single API route: PDFs in, report out
lib/
  types.ts                  — shared TypeScript types
  extractor.ts              — LLM extraction (jaaropgave + aangifte)
  analyzer.ts               — LLM comparison and aandachtspunten
rules/
  aandachtspunten.md        — editable tax flag rules
docs/adr/
  0001-...md                — architectural decision records
```
