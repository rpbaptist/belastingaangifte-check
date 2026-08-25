import type { Chunk, ScoredChunk, VectorStore } from "./types";

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Linear scan + sort. Fine at a few hundred chunks — no ANN index needed at this corpus size.
export class FileVectorStore implements VectorStore {
  constructor(private chunks: Chunk[]) {}

  async search(queryEmbedding: number[], k: number): Promise<ScoredChunk[]> {
    return this.chunks
      .map(({ embedding, ...chunk }) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
