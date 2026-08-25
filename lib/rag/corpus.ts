import fs from "fs";
import path from "path";
import { z } from "zod";
import { FileVectorStore } from "./vector-store";
import type { VectorStore } from "./types";

const ChunkSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
  embedding: z.array(z.number()),
});
const CorpusSchema = z.array(ChunkSchema);

let cached: VectorStore | null = null;

// Mirrors the fs.readFileSync(path.join(process.cwd(), ...)) pattern lib/analyzer.ts
// already uses in production for rules/aandachtspunten.md, which Next's output file
// tracing already bundles correctly — no next.config.js changes needed.
export function getVectorStore(): VectorStore {
  if (cached) return cached;

  let chunks: z.infer<typeof CorpusSchema> = [];
  try {
    const file = path.join(process.cwd(), "lib", "rag", "corpus.json");
    chunks = CorpusSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    chunks = []; // corpus.json missing/corrupt — retrieval degrades to empty context
  }

  cached = new FileVectorStore(chunks);
  return cached;
}
