# ADR 0003: Model selection per call type

## Status

Accepted

## Context

All three API call types (jaaropgave extraction, aangifte extraction, question answering) initially used `claude-sonnet-4-6`. Running tests with real PDFs cost ~€5 quickly. Extraction is mechanical (read PDF, output fixed JSON schema); the question route produces short conversational responses. Neither requires Sonnet's reasoning depth.

## Decision

- **Extraction** (`lib/extractor.ts`): `claude-haiku-4-5-20251001` — structured JSON from a fixed schema; Haiku handles this reliably at ~4–5× lower cost
- **Analysis** (`lib/analyzer.ts`): `claude-sonnet-4-6` — amount matching across field types, dividend tax mapping, and aandachtspunten require domain reasoning
- **Question answering** (`app/api/question/route.ts`): `claude-haiku-4-5-20251001` — conversational responses capped at 3 paragraphs; no complex reasoning needed

## Alternatives considered

- **Sonnet everywhere** — baseline; no cost optimisation
- **Haiku for analysis** — rejected; the matching nuances (dividend field mapping, mortgage lifecycle events) and aandachtspunten quality degraded in testing

## Consequences

- Extraction and question costs drop significantly
- If extraction quality regresses on unusual documents, switch the extractor MODEL constant to Sonnet without touching anything else
- Model constants are file-local; no shared config to update across files
