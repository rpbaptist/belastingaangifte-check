import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { StatementExtractionSchema, TaxReturnEntrySchema, TaxReturnSchema } from "@/lib/schemas";
import type { ExtractedData } from "@/lib/types";
import { splitStatements } from "@/lib/extraction-session";
import { FIXTURES_DIR, listSubdirectories } from "./fixtures";
import type { ReportSummary } from "./interpretation";

// Interpretation fixtures live one directory each under eval/interpretation/ (#104). Each
// scenario reuses the perception fixtures' expected.json files as extraction output, so it
// holds no real data and needs no API key. See eval/interpretation/README.md.
const INTERPRETATION_DIR = path.join(process.cwd(), "eval", "interpretation");

// A document is either a perception fixture (by name) or a file in the scenario directory,
// for shapes the perception set does not have yet. Manifest order is the order handed to
// buildReport — reconcile() depends on it (#180).
const DocumentRefSchema = z.union([
  z.object({ fixture: z.string() }).strict(),
  z.object({ file: z.string() }).strict(),
]);

const ScenarioManifestSchema = z
  .object({
    taxReturn: z
      .object({
        fixture: z.string(),
        // Aangifte rows the perception PDF does not print. Appended to the fixture's entries.
        extraEntries: z.array(TaxReturnEntrySchema).default([]),
      })
      .strict(),
    bewijsstukken: z.array(DocumentRefSchema),
  })
  .strict();

type DocumentRef = z.infer<typeof DocumentRefSchema>;

export function listScenarios(): string[] {
  return listSubdirectories(INTERPRETATION_DIR);
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf-8"));
}

function documentPath(scenarioDir: string, ref: DocumentRef): string {
  return "fixture" in ref
    ? path.join(FIXTURES_DIR, ref.fixture, "expected.json")
    : path.join(scenarioDir, ref.file);
}

// Perception fixtures for a jaaropgave hold a bare AnnualStatementData (no documentKind);
// property fixtures carry theirs. Both are read as the StatementExtraction the pipeline gets.
function readBewijsstuk(file: string) {
  const raw = readJson(file) as Record<string, unknown>;
  return StatementExtractionSchema.parse(
    "documentKind" in raw ? raw : { documentKind: "jaaropgave", ...raw }
  );
}

export function loadScenario(name: string): { input: ExtractedData; expected: ReportSummary } {
  const dir = path.join(INTERPRETATION_DIR, name);
  const manifest = ScenarioManifestSchema.parse(readJson(path.join(dir, "scenario.json")));

  const taxReturn = TaxReturnSchema.parse(
    readJson(documentPath(dir, { fixture: manifest.taxReturn.fixture }))
  );
  taxReturn.entries.push(...manifest.taxReturn.extraEntries);

  // The same split the extraction session applies, so a split bug fails the replay too.
  const input: ExtractedData = {
    taxReturn,
    ...splitStatements(manifest.bewijsstukken.map((ref) => readBewijsstuk(documentPath(dir, ref)))),
  };

  return { input, expected: readJson(path.join(dir, "expected.json")) as ReportSummary };
}
