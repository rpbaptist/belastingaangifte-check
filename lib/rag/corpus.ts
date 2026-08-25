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

  const file = path.join(process.cwd(), "lib", "rag", "corpus.json");
  let chunks: z.infer<typeof CorpusSchema> = [];

  if (fs.existsSync(file)) {
    // Missing corpus.json is an expected state (a fresh clone before the scraper has
    // been run) and stays silent. A file that exists but fails to parse or validate is
    // unexpected — e.g. a corrupted commit or a corpus.json/Chunk schema drift — and is
    // worth a warning rather than degrading silently.
    try {
      chunks = CorpusSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
    } catch (err) {
      console.warn("Kennisbank corpus.json exists but could not be loaded:", err);
    }
  }

  cached = new FileVectorStore(chunks);
  return cached;
}
