import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { readCache, writeCache } from "./extraction-cache";
import { parseLlmJson } from "./parse-llm-json";
import { AnnualStatementSchema, TaxReturnSchema } from "./schemas";
import { ANNUAL_STATEMENT_SYSTEM } from "./prompts/annual-statement";
import { TAX_RETURN_SYSTEM } from "./prompts/tax-return";
import { EXTRACTION_MODEL, extractResponseText } from "./llm";
import { withRetry } from "./utils";
import { translate, formatExtractionFailed, type Language } from "./translations";
import { getPdfParserClient, type PdfParserClient } from "./pdf-parser-client";

const MODEL = EXTRACTION_MODEL;

/**
 * Builds the extraction request content. Tries the Parser first (see
 * tax-pdf-parser's CONTEXT.md): a successful parse sends the document as
 * clean markdown, so Claude does semantic field-mapping over
 * already-correctly-parsed text instead of also solving visual table
 * layout. Any failure — no client configured, or a Parse failure — falls
 * back to today's raw PDF document block, unchanged. This makes the
 * Parser strictly additive: extraction can only get more reliable, never
 * less, than it was before tax-pdf-parser existed.
 */
export async function resolveExtractionContent(
  pdfBase64: string,
  userPrompt: string,
  parserClient: PdfParserClient | undefined
): Promise<Anthropic.Messages.ContentBlockParam[]> {
  if (parserClient) {
    try {
      const markdown = await parserClient.parse(Buffer.from(pdfBase64, "base64"));
      return [
        { type: "text", text: `Document content (parsed from PDF):\n\n${markdown}` },
        { type: "text", text: userPrompt },
      ];
    } catch {
      // Parse failure: fall through to the raw PDF path below.
    }
  }
  return [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    } as Anthropic.DocumentBlockParam,
    { type: "text", text: userPrompt },
  ];
}

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

  const content = await resolveExtractionContent(pdfBase64, opts.userPrompt, getPdfParserClient());
  const response = await withRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
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
