# ADR 0001: Aandachtspunten rules stored in Markdown

## Status
Accepted

## Context
The analyst LLM generates aandachtspunten (substantive tax flags) based on patterns in extracted data. These patterns need to be maintained and extended over time without requiring code changes.

## Decision
Store rules in `rules/aandachtspunten.md`. The file is read at runtime and injected verbatim into the analyst system prompt. Rules are written in plain Dutch/English, readable by a non-developer.

## Alternatives considered
- **Hardcoded in prompt string**: no way to amend without touching source code
- **Database-backed rules**: operational overhead, unnecessary for a single-user tool
- **Separate config JSON/YAML**: structured but harder to write prose explanations per rule

## Consequences
- Rules are editable without code changes or redeployment (on local use; Vercel requires redeploy)
- No validation of rule syntax — a malformed rule silently degrades output
- If rule count grows large, prompt token cost increases
- Future migration to structured storage (DB, CMS) requires extracting rules from freeform prose
