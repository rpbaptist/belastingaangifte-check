import { promises as fs } from "fs";
import path from "path";
import type { AnalysisReport, AnnualStatementData, AttentionPoint, TaxReturnData } from "./types";
import { z } from "zod";
import { parseLlmJson } from "./parse-llm-json";
import { reconcile } from "./reconciler";
import { categorize, type AmountMismatch } from "./categorizer";
import { runRuleChecks } from "./rule-checks";
import { LLMAnalysisResponseSchema } from "./schemas";
import {
  buildAnalyzerPrompt,
  buildAnalyzerPromptSuffix,
  buildUserMessage,
} from "./prompts/analyzer";
import { readAnalysisCache, writeAnalysisCache } from "./extraction-cache";
import { ANALYSIS_MODEL, createClient, extractResponseText } from "./llm";
import { translate, formatAnalysisFailed, type Language } from "./translations";
import { retrieveKennisbankContext, formatRetrievedContext } from "./rag/retrieval";
import type Anthropic from "@anthropic-ai/sdk";

export function buildAnalysisRequest(
  amountMismatches: AmountMismatch[],
  covered: { accountNumber: string; institution: string }[],
  rules: string,
  language: Language = "nl",
  retrievedContext: string = ""
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: ANALYSIS_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: buildAnalyzerPrompt(rules, language),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: buildAnalyzerPromptSuffix(retrievedContext, language),
      },
    ],
    messages: [{ role: "user", content: buildUserMessage(amountMismatches, covered, language) }],
  };
}

export function parseAnalysisResponse(
  response: Anthropic.Message,
  language: Language = "nl"
): AttentionPoint[] {
  if (response.stop_reason === "max_tokens") {
    throw new Error(translate("analysisAbortedTooMany", language));
  }

  const text = extractResponseText(response);
  if (text === undefined) {
    throw new Error(translate("noResponseDuringAnalysis", language));
  }

  const raw = parseLlmJson(text);
  try {
    const { attentionPoints } = LLMAnalysisResponseSchema.parse(raw);
    return attentionPoints;
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues[0]?.message : translate("unexpectedFormat", language);
    throw new Error(formatAnalysisFailed(msg ?? translate("unexpectedFormat", language), language));
  }
}

export async function analyzeDocuments(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  apiKey?: string,
  language: Language = "nl"
): Promise<Omit<AnalysisReport, "extractionErrors">> {
  const client = createClient(apiKey);

  const matchResult = reconcile(taxReturn, annualStatements);
  const { covered, missingStatement, notFilledIn, amountMismatches } = categorize(matchResult);
  const rulePoints = runRuleChecks(annualStatements, taxReturn.taxYear, language);

  if (amountMismatches.length === 0) {
    return {
      taxYear: taxReturn.taxYear,
      covered,
      missingStatement,
      notFilledIn,
      attentionPoints: rulePoints,
    };
  }

  const cached = readAnalysisCache<{ llmPoints: AttentionPoint[] }>(
    taxReturn,
    annualStatements,
    language
  );
  let llmPoints: AttentionPoint[];

  if (cached) {
    llmPoints = cached.llmPoints;
  } else {
    const rules = await fs.readFile(
      path.join(process.cwd(), "rules", "aandachtspunten.md"),
      "utf-8"
    );

    let retrievedContext = "";
    try {
      const chunks = await retrieveKennisbankContext(amountMismatches);
      retrievedContext = formatRetrievedContext(chunks, language);
    } catch (err) {
      console.warn("Kennisbank retrieval failed, continuing without official-source context:", err);
    }

    const response = await client.messages.create(
      buildAnalysisRequest(amountMismatches, covered, rules, language, retrievedContext)
    );
    llmPoints = parseAnalysisResponse(response, language);

    writeAnalysisCache(
      taxReturn,
      annualStatements,
      {
        llmPoints,
        missingStatement,
        notFilledIn,
      },
      language
    );
  }

  return {
    taxYear: taxReturn.taxYear,
    covered,
    missingStatement,
    notFilledIn,
    attentionPoints: [...rulePoints, ...llmPoints],
  };
}
