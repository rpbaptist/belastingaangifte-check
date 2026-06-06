import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisReport, AnnualStatementData, AttentionPoint, TaxReturnData } from "./types";
import { z } from "zod";
import { parseLlmJson } from "./parse-llm-json";
import { reconcile } from "./reconciler";
import { categorize, type AmountMismatch } from "./categorizer";
import { runRuleChecks } from "./rule-checks";
import { LLMAnalysisResponseSchema } from "./schemas";
import { buildAnalyzerPrompt, buildUserMessage } from "./prompts/analyzer";
import { readAnalysisCache, writeAnalysisCache } from "./extraction-cache";

const MODEL = "claude-sonnet-4-6";

export function buildAnalysisRequest(
  amountMismatches: AmountMismatch[],
  covered: { accountNumber: string; institution: string }[],
  rules: string
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: buildAnalyzerPrompt(rules),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserMessage(amountMismatches, covered) }],
  };
}

export function parseAnalysisResponse(response: Anthropic.Message): AttentionPoint[] {
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "Analyse afgebroken — te veel posten om te verwerken. Probeer met minder jaaropgaves tegelijk."
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Geen reactie ontvangen tijdens de analyse");
  }

  const raw = parseLlmJson(textBlock.text);
  try {
    const { attentionPoints } = LLMAnalysisResponseSchema.parse(raw);
    return attentionPoints;
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "onverwacht formaat";
    throw new Error(`Analyse mislukt: ${msg}`);
  }
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

  if (amountMismatches.length === 0) {
    return {
      taxYear: taxReturn.taxYear,
      covered,
      missingStatement,
      notFilledIn,
      attentionPoints: rulePoints,
    };
  }

  const cached = readAnalysisCache<{ llmPoints: AttentionPoint[] }>(taxReturn, annualStatements);
  let llmPoints: AttentionPoint[];

  if (cached) {
    llmPoints = cached.llmPoints;
  } else {
    const response = await client.messages.create(
      buildAnalysisRequest(amountMismatches, covered, rules)
    );
    llmPoints = parseAnalysisResponse(response);

    writeAnalysisCache(taxReturn, annualStatements, {
      llmPoints,
      missingStatement,
      notFilledIn,
    });
  }

  return {
    taxYear: taxReturn.taxYear,
    covered,
    missingStatement,
    notFilledIn,
    attentionPoints: [...rulePoints, ...llmPoints],
  };
}
