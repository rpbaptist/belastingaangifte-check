import { withRetry } from "../utils";
import type { EmbeddingClient } from "./types";

const EMBEDDING_MODEL = "voyage-4-lite";
const EMBEDDING_DIMENSIONS = 512;

class VoyageApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// Voyage returns 429 for its (temporary, until a payment method propagates) reduced
// rate limits as well as genuine rate limiting — both are worth retrying, same as 5xx.
function isRetryableVoyageError(err: unknown): boolean {
  return err instanceof VoyageApiError && (err.status === 429 || err.status >= 500);
}

// VOYAGE_API_KEY is a fixed server-side secret paying only for embedding this project's
// own fixed corpus and its own analysis-time queries — unlike the Anthropic key, it is
// never user-supplied, so there's no per-request override.
export function createVoyageClient(apiKey = process.env.VOYAGE_API_KEY): EmbeddingClient {
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  return {
    async embed(texts, inputType) {
      return withRetry(
        async () => {
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
            throw new VoyageApiError(
              res.status,
              `Voyage embeddings request failed: ${res.status} ${await res.text()}`
            );
          }

          const json = (await res.json()) as { data: { embedding: number[] }[] };
          return json.data.map((d) => d.embedding);
        },
        4,
        isRetryableVoyageError
      );
    },
  };
}
