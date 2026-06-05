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
- **Haiku for analysis** — initially rejected because the LLM was doing account-number matching as well as amount comparison and aandachtspunten. After the reconciliation refactor (ADR 0002) moved all matching to TypeScript, the analyser's remaining tasks are amount comparison, dividend field mapping, and aandachtspunten generation. Haiku was re-evaluated: amount comparison and field mapping are rule-following tasks Haiku handles reliably, but aandachtspunten quality (open-ended Dutch tax judgment) degraded. The cost saving is also modest — analysis is ~$0.02 of a ~$0.04 total run cost, and switching to Haiku saves ~35% of that call, ~$0.01/run. Not worth the quality risk at this volume.

## Cost estimate

Typical run: 1 aangifte + 4 jaaropgaves.

| Call                      | Model      | Input       | Output     | Cost       |
| ------------------------- | ---------- | ----------- | ---------- | ---------- |
| 5 × extraction (parallel) | Haiku 4.5  | ~12,700 tok | ~2,200 tok | ~$0.02     |
| 1 × analysis              | Sonnet 4.6 | ~3,300 tok  | ~650 tok   | ~$0.02     |
| **Total**                 |            |             |            | **~$0.04** |

Extraction scales linearly with PDF count and size. Analysis scales with the number of matched/unmatched accounts. Prompt caching on the shared jaaropgave system prompt reduces extraction cost when the cache is warm. Prices are approximate — verify at console.anthropic.com.

## Consequences

- Extraction and question costs drop significantly
- If extraction quality regresses on unusual documents, switch the extractor MODEL constant to Sonnet without touching anything else
- Model constants are file-local; no shared config to update across files
- Re-evaluate Haiku for analysis if aandachtspunten rules become more structured (reducing the open-ended reasoning requirement) or if Haiku's tax domain knowledge improves in future model versions
