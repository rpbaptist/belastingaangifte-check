import crypto from "crypto";
import fs from "fs";
import path from "path";

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
