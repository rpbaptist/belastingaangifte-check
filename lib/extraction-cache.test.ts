import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("extraction cache", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "extraction-cache-test-"));
    process.chdir(tmpDir);
    vi.stubEnv("NODE_ENV", "development");
    // CACHE_DIR is computed from process.cwd() at import time, so a module
    // cached from a previous test would still point at that test's deleted tmpDir.
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("re-extracts when the system prompt changes", async () => {
    const { readCache, writeCache } = await import("./extraction-cache");
    writeCache("pdf-content", { value: 1 }, "prompt v1");

    expect(readCache("pdf-content", "prompt v1")).toEqual({ value: 1 });
    expect(readCache("pdf-content", "prompt v2")).toBeNull();
  });

  it("hits the cache when the prompt is unchanged", async () => {
    const { readCache, writeCache } = await import("./extraction-cache");
    writeCache("pdf-content", { value: 1 }, "prompt v1");

    expect(readCache("pdf-content", "prompt v1")).toEqual({ value: 1 });
  });
});
