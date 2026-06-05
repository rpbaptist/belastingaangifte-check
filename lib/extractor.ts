import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { readCache, writeCache } from "./extraction-cache";
import { parseLlmJson } from "./parse-llm-json";
import { AnnualStatementSchema, TaxReturnSchema } from "./schemas";
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

type ExtractOpts<T> = {
  systemPrompt: string;
  maxTokens: number;
  userPrompt: string;
  noResponseError: string;
  schema: z.ZodType<T>;
};

async function extract<T>(pdfBase64: string, opts: ExtractOpts<T>, client: Anthropic): Promise<T> {
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
    throw new Error("Extractie afgebroken — het PDF is mogelijk te groot of te complex");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(opts.noResponseError);
  }

  const raw = parseLlmJson(textBlock.text);
  try {
    const result = opts.schema.parse(raw);
    writeCache(pdfBase64, result);
    return result;
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "onverwacht formaat";
    throw new Error(`Extractie mislukt: ${msg}`);
  }
}

export function extractAnnualStatement(
  pdfBase64: string,
  client: Anthropic
): Promise<AnnualStatementData> {
  return extract(
    pdfBase64,
    {
      systemPrompt: ANNUAL_STATEMENT_SYSTEM,
      maxTokens: 4096,
      userPrompt: "Extract the structured data from this jaaropgave.",
      noResponseError: "Geen reactie ontvangen bij verwerking van de jaaropgave",
      schema: AnnualStatementSchema,
    },
    client
  );
}

export function extractTaxReturn(pdfBase64: string, client: Anthropic): Promise<TaxReturnData> {
  return extract(
    pdfBase64,
    {
      systemPrompt: TAX_RETURN_SYSTEM,
      maxTokens: 8192,
      userPrompt: "Extract all non-zero entries from this belastingaangifte.",
      noResponseError: "Geen reactie ontvangen bij verwerking van de aangifte",
      schema: TaxReturnSchema,
    },
    client
  );
}
