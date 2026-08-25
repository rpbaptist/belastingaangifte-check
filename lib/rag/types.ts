/** A single retrievable passage from the Kennisbank corpus, paired with its embedding vector. */
export interface Chunk {
  id: string; // `${sourceUrl}#${index}`
  text: string;
  sourceUrl: string;
  sourceTitle: string;
  embedding: number[];
}

export type IndexedChunk = Omit<Chunk, "embedding">;

export interface ScoredChunk {
  chunk: IndexedChunk;
  score: number;
}

// Swappable: FileVectorStore today, a hosted store (e.g. Upstash Vector) later.
// search() is async even though FileVectorStore is synchronous internally, so callers
// never need to change when the implementation swaps to a network-backed store.
export interface VectorStore {
  search(queryEmbedding: number[], k: number): Promise<ScoredChunk[]>;
}

export interface EmbeddingClient {
  embed(texts: string[], inputType: "query" | "document"): Promise<number[][]>;
}
