import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisReport, AnnualStatementData, TaxReturnData } from "./types";
import { z } from "zod";
import { parseLlmJson } from "./parse-llm-json";
import { reconcile } from "./reconciler";
import { categorize, type AmountMismatch } from "./categorizer";
import { runRuleChecks } from "./rule-checks";
import { LLMAnalysisResponseSchema } from "./schemas";
import { buildAnalyzerPrompt } from "./prompts/analyzer";

const MODEL = "claude-sonnet-4-6";

function buildUserMessage(
  amountMismatches: AmountMismatch[],
  annualStatements: AnnualStatementData[]
): string {
  const parts: string[] = [];

  if (amountMismatches.length > 0) {
    parts.push(
      "## Amount mismatches (review each — amounts differ by more than €1)",
      "",
      JSON.stringify(amountMismatches, null, 2),
      ""
    );
  } else {
    parts.push("## Amount mismatches", "", "None.", "");
  }

  parts.push(
    "## Annual statements (for context)",
    "",
    JSON.stringify(annualStatements, null, 2),
    "",
    "Generate the attentionPoints. Respond with the raw JSON object only — start your response with `{`."
  );

  return parts.join("\n");
}

export async function analyzeDocuments(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  rules: string,
  apiKey?: string
): Promise<Omit<AnalysisReport, "extractionErrors">> {
  const client = new Anthropic(apiKey ? { apiKey } : {});

  const matchResult = reconcile(taxReturn, annualStatements);
  const { covered, missingStatement, notFilledIn, amountMismatches } = categorize(matchResult);
  const rulePoints = runRuleChecks(annualStatements, taxReturn.taxYear);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: buildAnalyzerPrompt(rules),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: buildUserMessage(amountMismatches, annualStatements),
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("Analyse afgebroken — te veel posten om te verwerken. Probeer met minder jaaropgaves tegelijk.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Geen reactie ontvangen tijdens de analyse");
  }

  const raw = parseLlmJson(textBlock.text);
  let llmPoints;
  try {
    ({ attentionPoints: llmPoints } = LLMAnalysisResponseSchema.parse(raw));
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "onverwacht formaat";
    throw new Error(`Analyse mislukt: ${msg}`);
  }

  return {
    taxYear: taxReturn.taxYear,
    covered,
    missingStatement,
    notFilledIn,
    attentionPoints: [...rulePoints, ...llmPoints],
  };
}
