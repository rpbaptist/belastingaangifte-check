import type { AmountMismatch } from "../categorizer";
import { createVoyageClient } from "./embeddings";
import { getVectorStore } from "./corpus";
import type { EmbeddingClient, ScoredChunk, VectorStore } from "./types";

export function buildRetrievalQuery(amountMismatches: AmountMismatch[]): string {
  const topics = new Set<string>();
  for (const m of amountMismatches) {
    topics.add(m.aangifte.field);
    topics.add(m.jaaropgave.statement.institutionType);
    const mortgageType = m.jaaropgave.statement.metadata.mortgageType;
    if (mortgageType) topics.add(`hypotheek ${mortgageType}`);
  }
  return `Nederlandse belastingaangifte aandachtspunten: ${[...topics].join(", ")}`;
}

export function formatRetrievedContext(chunks: ScoredChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c) => `### ${c.chunk.sourceTitle}\nBron: ${c.chunk.sourceUrl}\n\n${c.chunk.text}`)
    .join("\n\n---\n\n");
}

export async function retrieveKennisbankContext(
  amountMismatches: AmountMismatch[],
  opts: { k?: number; embeddingClient?: EmbeddingClient; store?: VectorStore } = {}
): Promise<ScoredChunk[]> {
  if (amountMismatches.length === 0) return [];

  const query = buildRetrievalQuery(amountMismatches);
  const client = opts.embeddingClient ?? createVoyageClient();
  const [queryEmbedding] = await client.embed([query], "query");
  const store = opts.store ?? getVectorStore();
  return store.search(queryEmbedding, opts.k ?? 5);
}
