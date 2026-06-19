import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { readCache, writeCache } from "./extraction-cache";
import { parseLlmJson } from "./parse-llm-json";
import { AnnualStatementSchema, TaxReturnSchema } from "./schemas";
import { ANNUAL_STATEMENT_SYSTEM } from "./prompts/annual-statement";
import { TAX_RETURN_SYSTEM } from "./prompts/tax-return";
import { EXTRACTION_MODEL } from "./llm";
import { withRetry } from "./utils";
import { translate, formatExtractionFailed, type Language } from "./translations";

const MODEL = EXTRACTION_MODEL;

type ExtractOpts<T> = {
  systemPrompt: string;
  maxTokens: number;
  userPrompt: string;
  noResponseErrorKey: "noResponseAnnualStatement" | "noResponseTaxReturn";
  schema: z.ZodType<T>;
};

async function extract<T>(
  pdfBase64: string,
  opts: ExtractOpts<T>,
  client: Anthropic,
  language: Language
): Promise<T> {
  const cached = readCache<T>(pdfBase64);
  if (cached) {
    try {
      return opts.schema.parse(cached);
    } catch {
      // cache predates current schema — fall through to re-extract
    }
  }

  const response = await withRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            } as Anthropic.DocumentBlockParam,
            { type: "text", text: opts.userPrompt },
          ],
        },
      ],
    })
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error(translate("extractionAbortedTooLarge", language));
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(translate(opts.noResponseErrorKey, language));
  }

  const raw = parseLlmJson(textBlock.text);
  try {
    const result = opts.schema.parse(raw);
    writeCache(pdfBase64, result);
    return result;
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues[0]?.message : translate("unexpectedFormat", language);
    throw new Error(
      formatExtractionFailed(msg ?? translate("unexpectedFormat", language), language)
    );
  }
}

export function extractAnnualStatement(
  pdfBase64: string,
  client: Anthropic,
  language: Language = "nl"
): Promise<AnnualStatementData> {
  return extract(
    pdfBase64,
    {
      systemPrompt: ANNUAL_STATEMENT_SYSTEM,
      maxTokens: 4096,
      userPrompt: "Extract the structured data from this jaaropgave.",
      noResponseErrorKey: "noResponseAnnualStatement",
      schema: AnnualStatementSchema,
    },
    client,
    language
  );
}

export function extractTaxReturn(
  pdfBase64: string,
  client: Anthropic,
  language: Language = "nl"
): Promise<TaxReturnData> {
  return extract(
    pdfBase64,
    {
      systemPrompt: TAX_RETURN_SYSTEM,
      maxTokens: 8192,
      userPrompt: "Extract all non-zero entries from this belastingaangifte.",
      noResponseErrorKey: "noResponseTaxReturn",
      schema: TaxReturnSchema,
    },
    client,
    language
  );
}
