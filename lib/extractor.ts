import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { StatementExtraction, TaxReturnData } from "./types";
import { readCache, writeCache } from "./extraction-cache";
import { parseLlmJson } from "./parse-llm-json";
import { StatementExtractionSchema, TaxReturnSchema } from "./schemas";
import { STATEMENT_SYSTEM } from "./prompts/statement";
import { TAX_RETURN_SYSTEM } from "./prompts/tax-return";
import { EXTRACTION_MODEL, extractResponseText } from "./llm";
import { withRetry } from "./utils";
import { translate, formatExtractionFailed, type Language } from "./translations";

const MODEL = EXTRACTION_MODEL;

type ExtractOpts<T> = {
  systemPrompt: string;
  maxTokens: number;
  userPrompt: string;
  noResponseErrorKey: "noResponseStatement" | "noResponseTaxReturn";
  schema: z.ZodType<T>;
};

async function extract<T>(
  pdfBase64: string,
  opts: ExtractOpts<T>,
  client: Anthropic,
  language: Language
): Promise<T> {
  const cached = readCache<T>(pdfBase64, opts.systemPrompt);
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
      temperature: 0,
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
  const text = extractResponseText(response);
  if (text === undefined) {
    throw new Error(translate(opts.noResponseErrorKey, language));
  }

  const raw = parseLlmJson(text);
  try {
    const result = opts.schema.parse(raw);
    writeCache(pdfBase64, result, opts.systemPrompt);
    return result;
  } catch (err) {
    const msg =
      err instanceof z.ZodError ? err.issues[0]?.message : translate("unexpectedFormat", language);
    throw new Error(
      formatExtractionFailed(msg ?? translate("unexpectedFormat", language), language)
    );
  }
}

export function extractStatement(
  pdfBase64: string,
  client: Anthropic,
  language: Language = "nl"
): Promise<StatementExtraction> {
  return extract(
    pdfBase64,
    {
      systemPrompt: STATEMENT_SYSTEM,
      maxTokens: 4096,
      userPrompt: "Identify and extract the structured data from this bewijsstuk.",
      noResponseErrorKey: "noResponseStatement",
      schema: StatementExtractionSchema,
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
