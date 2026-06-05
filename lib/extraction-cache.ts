import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { AnnualStatementData, TaxReturnData } from "./types";

// Development-only cache: stores extracted financial data (PII) as plain JSON on disk.
// Active only when NODE_ENV === "development". The .extracted/ directory is gitignored
// and must never be committed, shared, or deployed.
const CACHE_DIR = path.join(process.cwd(), ".extracted");

function cacheKey(pdfBase64: string): string {
  return crypto.createHash("sha256").update(pdfBase64).digest("hex");
}

export function readCache<T>(pdfBase64: string): T | null {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const file = path.join(CACHE_DIR, `${cacheKey(pdfBase64)}.json`);
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeCache<T>(pdfBase64: string, data: T): void {
  if (process.env.NODE_ENV !== "development") return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${cacheKey(pdfBase64)}.json`), JSON.stringify(data));
}

// ─── Analysis result cache ──────────────────────────────────────────────────

function analysisKey(taxReturn: TaxReturnData, annualStatements: AnnualStatementData[]): string {
  const payload = JSON.stringify({ taxReturn, annualStatements });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function readAnalysisCache<T>(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[]
): T | null {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const file = path.join(CACHE_DIR, `analysis-${analysisKey(taxReturn, annualStatements)}.json`);
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeAnalysisCache<T>(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  data: T
): void {
  if (process.env.NODE_ENV !== "development") return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const key = analysisKey(taxReturn, annualStatements);
  fs.writeFileSync(path.join(CACHE_DIR, `analysis-${key}.json`), JSON.stringify(data, null, 2));
  // Always overwrite last-analysis.json for easy direct inspection
  fs.writeFileSync(path.join(CACHE_DIR, "last-analysis.json"), JSON.stringify(data, null, 2));
}
