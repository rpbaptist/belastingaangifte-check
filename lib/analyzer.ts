import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { AnalysisReport, AnnualStatementData, TaxReturnData } from "./types";
import { z } from "zod";
import { parseLlmJson } from "./parse-llm-json";
import { koppeling } from "./koppeling";
import { AnalysisReportSchema } from "./schemas";
import { buildAnalyzerPrompt } from "./prompts/analyzer";

const MODEL = "claude-sonnet-4-6";

function loadRules(): string {
  const rulesPath = path.join(process.cwd(), "rules", "aandachtspunten.md");
  try {
    return fs.readFileSync(rulesPath, "utf-8");
  } catch {
    throw new Error(`Kon aandachtspunten-regels niet laden: ${rulesPath}`);
  }
}

const RULES = loadRules();

export async function analyzeDocuments(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  apiKey?: string
): Promise<Omit<AnalysisReport, "extractionErrors">> {
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const { matched, onlyInAangifte, onlyInJaaropgave } = koppeling(taxReturn, annualStatements);

  const userMessage = [
    "## Matched pairs (account numbers resolved by code)",
    "",
    JSON.stringify(matched, null, 2),
    "",
    `## Aangifte entries without matching jaaropgave (${onlyInAangifte.length})`,
    "",
    JSON.stringify(onlyInAangifte, null, 2),
    "",
    `## Jaaropgave accounts without matching aangifte entry (${onlyInJaaropgave.length})`,
    "",
    JSON.stringify(onlyInJaaropgave, null, 2),
    "",
    "Produce the analysis report. Respond with the raw JSON object only — start your response with `{`.",
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: buildAnalyzerPrompt(RULES),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("Analyse afgebroken — te veel posten om te verwerken. Probeer met minder jaaropgaves tegelijk.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Geen reactie ontvangen tijdens de analyse");
  }

  const raw = parseLlmJson(textBlock.text);
  try {
    return AnalysisReportSchema.parse(raw);
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "onverwacht formaat";
    throw new Error(`Analyse mislukt: ${msg}`);
  }
}
