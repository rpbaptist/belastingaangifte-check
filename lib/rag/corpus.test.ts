import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// import fs from "fs" resolves to the mock's `default` object, while `import("fs")`
// in the test resolves named exports — share the same vi.fn() instances across both so
// configuring one via either path affects what corpus.ts actually calls.
vi.mock("fs", () => {
  const existsSync = vi.fn();
  const readFileSync = vi.fn();
  return { default: { existsSync, readFileSync }, existsSync, readFileSync };
});

describe("getVectorStore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to an empty store, silently, when corpus.json does not exist", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getVectorStore } = await import("./corpus");
    const store = getVectorStore();
    const results = await store.search([1, 0, 0], 5);

    expect(results).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls back to an empty store and logs a warning when corpus.json exists but is invalid", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("not valid json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getVectorStore } = await import("./corpus");
    const store = getVectorStore();
    const results = await store.search([1, 0, 0], 5);

    expect(results).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      "Kennisbank corpus.json exists but could not be loaded:",
      expect.anything()
    );
  });
});
