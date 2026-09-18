import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnualStatementData, TaxReturnData } from "./types";

const taxReturn: TaxReturnData = {
  taxYear: 2023,
  entries: [{ box: "1", field: "Loon", accountNumber: null, amount: 50000 }],
};
const annualStatements: AnnualStatementData[] = [];

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

describe("analysis cache", () => {
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-cache-test-"));
    process.chdir(tmpDir);
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Editing the analyzer system prompt (or the rules/aandachtspunten.md it embeds)
  // must not silently keep serving a stale cached analysis — see #115.
  it("re-analyzes when the system prompt changes", async () => {
    const { readAnalysisCache, writeAnalysisCache } = await import("./extraction-cache");
    writeAnalysisCache(taxReturn, annualStatements, { value: 1 }, "prompt v1");

    expect(readAnalysisCache(taxReturn, annualStatements, "prompt v1")).toEqual({ value: 1 });
    expect(readAnalysisCache(taxReturn, annualStatements, "prompt v2")).toBeNull();
  });

  it("hits the cache when the prompt is unchanged", async () => {
    const { readAnalysisCache, writeAnalysisCache } = await import("./extraction-cache");
    writeAnalysisCache(taxReturn, annualStatements, { value: 1 }, "prompt v1");

    expect(readAnalysisCache(taxReturn, annualStatements, "prompt v1")).toEqual({ value: 1 });
  });
});
