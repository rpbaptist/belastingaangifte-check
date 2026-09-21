import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { Chunk } from "./types";

// Guards the committed Kennisbank artifact, not the chunker code: a corpus regenerated
// with a regressed chunker would otherwise ship orphan headings unnoticed.
const HEADING_PATTERN = /^#{1,6}\s/;

const corpus: Chunk[] = JSON.parse(
  readFileSync(path.join(__dirname, "corpus.json"), "utf-8")
);

const unitsOf = (chunk: Chunk) => chunk.text.split(/\n\s*\n/).map((u) => u.trim());

describe("committed Kennisbank corpus", () => {
  it("has no chunk that ends with a heading", () => {
    const offenders = corpus.filter((c) => HEADING_PATTERN.test(unitsOf(c).at(-1) ?? ""));
    expect(offenders.map((c) => c.id)).toEqual([]);
  });

  it("has no chunk made of headings only", () => {
    const offenders = corpus.filter((c) => unitsOf(c).every((u) => HEADING_PATTERN.test(u)));
    expect(offenders.map((c) => c.id)).toEqual([]);
  });
});
