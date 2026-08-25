import type { EmbeddingClient } from "./types";

export const EMBEDDING_MODEL = "voyage-4-lite";
export const EMBEDDING_DIMENSIONS = 512;

// VOYAGE_API_KEY is a fixed server-side secret paying only for embedding this project's
// own fixed corpus and its own analysis-time queries — unlike the Anthropic key, it is
// never user-supplied, so there's no per-request override.
export function createVoyageClient(apiKey = process.env.VOYAGE_API_KEY): EmbeddingClient {
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  return {
    async embed(texts, inputType) {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          input: texts,
          model: EMBEDDING_MODEL,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
        }),
      });

      if (!res.ok) {
        throw new Error(`Voyage embeddings request failed: ${res.status} ${await res.text()}`);
      }

      const json = (await res.json()) as { data: { embedding: number[] }[] };
      return json.data.map((d) => d.embedding);
    },
  };
}
