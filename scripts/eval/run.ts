// Perception eval runner (ADR 0009/0010). Extracts each committed fixture PDF with the
// current extraction prompt and diffs the result against its known-correct expected.json,
// reporting per-field misreads.
//
//   ANTHROPIC_API_KEY=... npm run eval            # all fixtures
//   ANTHROPIC_API_KEY=... npm run eval -- aangifte-2023   # one fixture
//
// Opt-in and offline from CI: it calls the Anthropic API (a real cost) and is never part of
// `npm test`. Exits non-zero if any fixture has a mismatch, so it doubles as a pass/fail gate
// when comparing a prompt change against the recorded baseline.
//
// Three fixture shapes are supported (ADR 0010 anticipated "a second diff shape"): a
// TaxReturnData fixture (expected.json has `entries`) runs through extractTaxReturn; a
// PropertyStatementData fixture (expected.json has `amounts`) and an AnnualStatementData
// fixture (expected.json has `accounts`) run through extractStatement, asserting the document
// was classified as the expected kind along the way.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/llm";
import { extractStatement, extractTaxReturn } from "@/lib/extractor";
import { TaxReturnSchema } from "@/lib/schemas";
import {
  diffPropertyStatement,
  diffTaxReturn,
  formatDiffReport,
  formatPropertyStatementDiffReport,
  isPass,
  isPropertyStatementPass,
} from "@/lib/eval/diff";
import {
  diffAnnualStatement,
  formatAnnualStatementDiffReport,
  isAnnualStatementPass,
} from "@/lib/eval/annual-statement-diff";
import { FIXTURES_DIR, listFixtures } from "@/lib/eval/fixtures";
import type { AnnualStatementData, PropertyStatementData } from "@/lib/types";

function selectFixtures(): string[] {
  const requested = process.argv.slice(2);
  const all = listFixtures();
  if (requested.length === 0) return all;

  const unknown = requested.filter((name) => !all.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown fixture(s): ${unknown.join(", ")}. Available: ${all.join(", ")}`);
  }
  return requested;
}

async function runTaxReturnFixture(
  name: string,
  pdfBase64: string,
  expectedRaw: unknown,
  client: ReturnType<typeof createClient>
): Promise<boolean> {
  const expected = TaxReturnSchema.parse(expectedRaw);
  const actual = await extractTaxReturn(pdfBase64, client);
  const diff = diffTaxReturn(expected, actual);
  console.log(formatDiffReport(name, diff));
  console.log("");
  return isPass(diff);
}

async function runPropertyStatementFixture(
  name: string,
  pdfBase64: string,
  expected: PropertyStatementData,
  client: ReturnType<typeof createClient>
): Promise<boolean> {
  const extraction = await extractStatement(pdfBase64, client);
  if (extraction.documentKind !== expected.documentKind) {
    console.log(`${name}: FAIL`);
    console.log(
      `  document kind: expected ${expected.documentKind}, got ${extraction.documentKind}`
    );
    console.log("");
    return false;
  }
  // Narrowed by the check above: documentKind is one of the three property kinds, so this
  // extraction carries a propertyStatement payload (see lib/types.ts StatementExtraction).
  const actual = (extraction as { propertyStatement: PropertyStatementData }).propertyStatement;
  const diff = diffPropertyStatement(expected, actual);
  console.log(formatPropertyStatementDiffReport(name, diff));
  console.log("");
  return isPropertyStatementPass(diff);
}

async function runAnnualStatementFixture(
  name: string,
  pdfBase64: string,
  expected: AnnualStatementData,
  client: ReturnType<typeof createClient>
): Promise<boolean> {
  const extraction = await extractStatement(pdfBase64, client);
  if (extraction.documentKind !== "jaaropgave") {
    console.log(`${name}: FAIL`);
    console.log(`  document kind: expected jaaropgave, got ${extraction.documentKind}`);
    console.log("");
    return false;
  }
  const diff = diffAnnualStatement(expected, extraction.annualStatement);
  console.log(formatAnnualStatementDiffReport(name, diff));
  console.log("");
  return isAnnualStatementPass(diff);
}

function readFixtureFiles(name: string): { pdfBase64: string; expectedRaw: unknown } {
  const dir = path.join(FIXTURES_DIR, name);
  const pdfPath = path.join(dir, `${name}.pdf`);
  const expectedPath = path.join(dir, "expected.json");
  if (!existsSync(pdfPath)) {
    throw new Error(
      `Missing ${path.relative(process.cwd(), pdfPath)}. Run \`npm run eval:render\`.`
    );
  }
  if (!existsSync(expectedPath)) {
    throw new Error(`Missing ${path.relative(process.cwd(), expectedPath)} for fixture ${name}.`);
  }

  return {
    pdfBase64: readFileSync(pdfPath).toString("base64"),
    expectedRaw: JSON.parse(readFileSync(expectedPath, "utf-8")),
  };
}

function isPropertyFixture(expectedRaw: unknown): expectedRaw is PropertyStatementData {
  return typeof expectedRaw === "object" && expectedRaw !== null && "amounts" in expectedRaw;
}

function isAnnualStatementFixture(expectedRaw: unknown): expectedRaw is AnnualStatementData {
  return typeof expectedRaw === "object" && expectedRaw !== null && "accounts" in expectedRaw;
}

async function runFixture(name: string, client: ReturnType<typeof createClient>): Promise<boolean> {
  const { pdfBase64, expectedRaw } = readFixtureFiles(name);

  if (isPropertyFixture(expectedRaw)) {
    return runPropertyStatementFixture(name, pdfBase64, expectedRaw, client);
  }
  if (isAnnualStatementFixture(expectedRaw)) {
    return runAnnualStatementFixture(name, pdfBase64, expectedRaw, client);
  }
  return runTaxReturnFixture(name, pdfBase64, expectedRaw, client);
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
