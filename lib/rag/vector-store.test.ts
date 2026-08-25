import { describe, expect, it } from "vitest";
import { cosineSimilarity, FileVectorStore } from "./vector-store";
import type { Chunk } from "./types";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });
});

describe("FileVectorStore.search", () => {
  function makeChunk(id: string, embedding: number[]): Chunk {
    return {
      id,
      text: `text for ${id}`,
      sourceUrl: `https://example.org/${id}`,
      sourceTitle: id,
      embedding,
    };
  }

  it("ranks chunks by similarity and respects k", async () => {
    const store = new FileVectorStore([
      makeChunk("close", [0.9, 0.1, 0]),
      makeChunk("exact", [1, 0, 0]),
      makeChunk("far", [0, 0, 1]),
      makeChunk("mid", [0.5, 0.5, 0]),
    ]);

    const results = await store.search([1, 0, 0], 2);

    expect(results).toHaveLength(2);
    expect(results[0].chunk.id).toBe("exact");
    expect(results[1].chunk.id).toBe("close");
  });
});
