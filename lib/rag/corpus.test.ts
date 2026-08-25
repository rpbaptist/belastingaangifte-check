import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  default: { readFileSync: vi.fn() },
  readFileSync: vi.fn(),
}));

describe("getVectorStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to an empty store when corpus.json is missing", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });

    const { getVectorStore } = await import("./corpus");
    const store = getVectorStore();
    const results = await store.search([1, 0, 0], 5);

    expect(results).toEqual([]);
  });
});
