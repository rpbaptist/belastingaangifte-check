import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { readCache, writeCache } from "./extraction-cache";
import { parseLlmJson } from "./parse-llm-json";
import { AnnualStatementSchema, TaxReturnSchema } from "./schemas";
import { extractTaxYear } from "./tax-year-extractor";
import { ANNUAL_STATEMENT_SYSTEM } from "./prompts/annual-statement";
import { TAX_RETURN_SYSTEM } from "./prompts/tax-return";

const MODEL = "claude-haiku-4-5-20251001";

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Anthropic.APIError && err.status >= 500);
      if (retryable && attempt < maxAttempts) {
        const jitter = Math.random() * 500;
        await new Promise((r) => setTimeout(r, 1500 * attempt + jitter));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

function buildUserMessage(prompt: string, pdfText: string): string {
  const year = extractTaxYear(pdfText);
  const yearLine = year ? `Tax year: ${year}` : "Tax year: unknown — infer from content";
  return `${yearLine}\n\n${prompt}\n\nDocument text:\n\n${pdfText}`;
}

type ExtractOpts<T> = {
  systemPrompt: string;
  maxTokens: number;
  userPrompt: string;
  noResponseError: string;
  schema: z.ZodType<T>;
};

async function extract<T>(pdfText: string, opts: ExtractOpts<T>, apiKey?: string): Promise<T> {
  const cached = readCache<T>(pdfText);
  if (cached) {
    try {
      return opts.schema.parse(cached);
    } catch {
      // cache predates current schema — fall through to re-extract
    }
  }

  const client = new Anthropic(apiKey ? { apiKey } : {});
  const response = await withRetry(() =>
    client.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: [{ type: "text", text: opts.systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: buildUserMessage(opts.userPrompt, pdfText),
        },
      ],
    })
  );

  if (response.stop_reason === "max_tokens") {
    throw new Error("Extractie afgebroken — het document is mogelijk te groot of te complex");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(opts.noResponseError);
  }

  const raw = parseLlmJson(textBlock.text);
  try {
    const result = opts.schema.parse(raw);
    writeCache(pdfText, result);
    return result;
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "onverwacht formaat";
    throw new Error(`Extractie mislukt: ${msg}`);
  }
}

export function extractAnnualStatement(
  pdfText: string,
  apiKey?: string
): Promise<AnnualStatementData> {
  return extract(
    pdfText,
    {
      systemPrompt: ANNUAL_STATEMENT_SYSTEM,
      maxTokens: 4096,
      userPrompt: "Extract the structured data from this jaaropgave.",
      noResponseError: "Geen reactie ontvangen bij verwerking van de jaaropgave",
      schema: AnnualStatementSchema,
    },
    apiKey
  );
}

export function extractTaxReturn(pdfText: string, apiKey?: string): Promise<TaxReturnData> {
  return extract(
    pdfText,
    {
      systemPrompt: TAX_RETURN_SYSTEM,
      maxTokens: 8192,
      userPrompt: "Extract all non-zero entries from this belastingaangifte.",
      noResponseError: "Geen reactie ontvangen bij verwerking van de aangifte",
      schema: TaxReturnSchema,
    },
    apiKey
  );
}
