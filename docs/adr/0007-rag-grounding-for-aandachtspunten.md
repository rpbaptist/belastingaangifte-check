# ADR 0007: RAG grounding for aandachtspunten (Kennisbank)

## Status

Accepted

## Context

Aandachtspunten judgment is seeded by `rules/aandachtspunten.md` (ADR 0001) plus the model's training knowledge. Neither can cite or verify current Belastingdienst guidance, and official thresholds change — the `HEFFINGSVRIJ_VERMOGEN` table in `lib/rule-checks.ts` is already hand-maintained per tax year. Separately, this feature doubles as a learning exercise in RAG fundamentals, which ruled out reaching for a framework that would hide the mechanics.

## Decision

Hand-rolled RAG behind small interfaces, entirely in `lib/rag/`:

- **Chunking** (`chunker.ts`): heading-aware paragraph packing, ~1000 chars per chunk, ~120 chars of overlap with the neighbouring chunk. Pure and dependency-free.
- **Corpus**: an offline script (`scripts/rag/scrape-corpus.ts`, run by hand via `npm run scrape:kennisbank`) scrapes a curated ~14-page set of belastingdienst.nl pages (box 3, hypotheekrenteaftrek, dividendbelasting, aftrekposten), chunks them, embeds them via Voyage AI, and writes the result to `lib/rag/corpus.json`, which is committed to git.
- **Embeddings** (`embeddings.ts`): Voyage AI, model `voyage-4-lite`, 512 output dimensions, called via plain `fetch` (no SDK) so the wire format stays visible.
- **Retrieval** (`vector-store.ts`, `retrieval.ts`): in-process cosine similarity over the committed corpus, behind a `VectorStore` interface (`search(queryEmbedding, k)`). The retrieval query is built purely from the current `AmountMismatch[]` (field, institution type, mortgage metadata) — not from the full uploaded-statement list — so an unrelated uploaded statement can't leak irrelevant topics into the query.
- **Integration**: `lib/analyzer.ts`'s `analyzeDocuments()` retrieves relevant chunks and appends them to the analyzer system prompt as a new optional "Officiële bronnen" / "Official sources" section, alongside — not replacing — `rules/aandachtspunten.md`. Retrieval failure (missing key, network error, missing corpus) is caught and logged; analysis falls back to the prior rules-only behavior. Grounding is not surfaced to end users (no citation field on `AttentionPoint`) — the RAG pipeline itself, not a live citation UI, is what this work demonstrates.

## Alternatives considered

- **RAG framework (LlamaIndex.ts, LangChain.js)**: rejected — the point of this work is to learn RAG mechanics directly, and a framework would abstract away chunking, embedding calls, and similarity search.
- **Hosted vector DB (Upstash Vector) from day one**: deferred — unnecessary network dependency for a corpus of a few hundred chunks that fits trivially in memory. The `VectorStore` interface makes this a contained future swap (a new `UpstashVectorStore implements VectorStore`) that touches nothing else in the pipeline.
- **OpenAI embeddings**: rejected in favor of Voyage AI, Anthropic's recommended embedding partner, keeping the stack's non-Next.js dependencies to Anthropic + Voyage.
- **Full-site or sitemap-driven crawl**: rejected as out of scope for a tool with a narrow personal-income-tax focus; a curated list is easier to verify for relevance and quality.
- **Build-time corpus generation**: rejected — re-scraping on every Vercel deploy would add live network calls, cost, and flakiness for content that changes rarely; a committed, hand-regenerated corpus mirrors how `rules/aandachtspunten.md` is already managed.
- **Visible citations on `AttentionPoint`**: considered adding a `source` field and surfacing it in the UI. Rejected for now — the RAG pipeline is already fully visible to a code reader, the primary audience for this portfolio piece, so citation UI would add schema/UI plumbing without changing what the work demonstrates.

## Consequences

- New `VOYAGE_API_KEY` env var, set via `mise set` locally and via `vercel env add` in production — never `NEXT_PUBLIC_`-prefixed, since it's read server-side only.
- `lib/rag/corpus.json` requires manual regeneration and carries staleness risk; no automatic freshness check exists. Worth re-verifying each tax season.
- A future Upstash (or other hosted store) migration touches only `lib/rag/vector-store.ts` and the scraper's write step — chunking, embedding, and query construction are unaffected.
- If visible citations are wanted later, `AttentionPoint` would need a `source?: { title, url }` field validated against the actually-retrieved chunk set (never trust a free-text URL from the model).
