import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

// Fixtures live one directory each under eval/fixtures/ (ADR 0009). The renderer and the
// runner both discover them by directory name, so the rule lives here once — a manifest or a
// "must contain expected.json" filter would otherwise have to be kept in sync in two places.
export const FIXTURES_DIR = path.join(process.cwd(), "eval", "fixtures");

export function listFixtures(): string[] {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
