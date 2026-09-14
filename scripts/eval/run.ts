// Perception eval runner (ADR 0009). Extracts each committed aangifte fixture PDF with the
// current extraction prompt and diffs the result against its known-correct expected.json,
// reporting per-field misreads.
//
//   ANTHROPIC_API_KEY=... npm run eval            # all fixtures
//   ANTHROPIC_API_KEY=... npm run eval -- aangifte-2023   # one fixture
//
// Opt-in and offline from CI: it calls the Anthropic API (a real cost) and is never part of
// `npm test`. Exits non-zero if any fixture has a mismatch, so it doubles as a pass/fail gate
// when comparing a prompt change against the recorded baseline.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/llm";
import { extractTaxReturn } from "@/lib/extractor";
import { TaxReturnSchema } from "@/lib/schemas";
import { diffTaxReturn, isPass, formatDiffReport } from "@/lib/eval/diff";

const FIXTURES_DIR = path.join(process.cwd(), "eval", "fixtures");

function selectFixtures(): string[] {
  const requested = process.argv.slice(2);
  const all = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];
  if (requested.length === 0) return all;

  const unknown = requested.filter((name) => !all.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown fixture(s): ${unknown.join(", ")}. Available: ${all.join(", ")}`);
  }
  return requested;
}

async function runFixture(name: string, client: ReturnType<typeof createClient>): Promise<boolean> {
  const dir = path.join(FIXTURES_DIR, name);
  const pdfPath = path.join(dir, `${name}.pdf`);
  const expectedPath = path.join(dir, "expected.json");
  if (!existsSync(pdfPath)) {
    throw new Error(
      `Missing ${path.relative(process.cwd(), pdfPath)}. Run \`npm run eval:render\`.`
    );
  }

  const expected = TaxReturnSchema.parse(JSON.parse(readFileSync(expectedPath, "utf-8")));
  const pdfBase64 = readFileSync(pdfPath).toString("base64");

  const actual = await extractTaxReturn(pdfBase64, client);
  const diff = diffTaxReturn(expected, actual);
  console.log(formatDiffReport(name, diff));
  console.log("");
  return isPass(diff);
}

function requireApiKey(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  console.error("ANTHROPIC_API_KEY is required. This eval calls the Anthropic API.");
  process.exit(2);
}

async function runAll(fixtures: string[]): Promise<boolean[]> {
  const client = createClient();
  const results: boolean[] = [];
  for (const name of fixtures) {
    results.push(await runFixture(name, client));
  }
  return results;
}

async function main(): Promise<void> {
  requireApiKey();
  const fixtures = selectFixtures();
  if (fixtures.length === 0) {
    console.log("No fixtures found under eval/fixtures/.");
    return;
  }

  const results = await runAll(fixtures);
  const passed = results.filter(Boolean).length;
  console.log(`${passed}/${results.length} fixture(s) passed.`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
