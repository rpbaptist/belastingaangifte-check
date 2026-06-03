import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { readCache, writeCache } from "./extraction-cache";
import { parseLlmJson } from "./parse-llm-json";
import { AnnualStatementSchema, TaxReturnSchema } from "./schemas";

const MODEL = "claude-haiku-4-5-20251001";

const ANNUAL_STATEMENT_SYSTEM = `You are a Dutch tax document analyst. Extract structured data from a jaaropgave (annual statement) PDF.

Return ONLY a JSON object with this structure:
{
  "institution": "Name of the financial institution",
  "institutionType": "bank" | "broker" | "mortgage" | "other",  // unrecognised values default to "other"
  "taxYear": 2023,
  "accounts": [
    {
      "accountNumber": "IBAN or broker account ID",
      "description": "Human-readable label e.g. Spaarrekening",
      "amounts": {
        "bank":     { "balance": 12345, "interest": 234 },
        "broker":   { "dividend": 500, "foreignDividend": 200, "dutchDividendTax": 75, "foreignWithholdingTax": 30 },
        "mortgage": { "interestPaid": 8400, "remainingDebt": 180000 }
      }
    }
  ],
  "metadata": {
    "mortgageType": "aflossingsvrij"
  }
}

Rules:
- taxYear is the year the document covers (not the year it was printed)
- All amounts are numbers in euros. Preserve sign: a negative balance (e.g. credit-card debt "saldo -102") must be extracted as -102, not 102
- Use English keys for amount names
- Broker amount semantics:
  - dividend = total gross dividend received (domestic + foreign combined)
  - foreignDividend = portion of dividend from foreign sources (only set if the jaaropgave distinguishes)
  - dutchDividendTax = Nederlandse dividendbelasting ingehouden by the broker on Dutch holdings — 15% domestic voorheffing, verrekenbaar als ingehouden dividendbelasting in the aangifte
  - foreignWithholdingTax = buitenlandse bronbelasting on foreign dividends — verrekenbaar per belastingverdrag
  - If the jaaropgave only shows one combined "ingehouden dividendbelasting" line and the holdings are clearly Dutch (e.g. ASN, Nederlandse aandelen), put it in dutchDividendTax. If clearly foreign, foreignWithholdingTax. If mixed and not separable, put it in dutchDividendTax and add metadata note
- metadata holds any non-numeric fields relevant for tax advice (e.g. mortgageType)
- Omit fields you cannot determine — never guess
- Return ONLY the raw JSON object, no markdown fences, no explanation
- IMPORTANT — balance date for box 3: the Belastingdienst uses the balance on 1 januari of the tax year (= 31 december of the preceding year). If the jaaropgave shows both a "saldo per 1 januari [taxYear]" and a "saldo per 31 december [taxYear]", use the 1 januari balance. If only 31 december is shown, that is the correct balance for the FOLLOWING tax year's aangifte — set balance to that value but note it is end-of-year`;

const TAX_RETURN_SYSTEM = `You are a Dutch tax document analyst. Extract structured data from a belastingaangifte (income tax return) PDF issued by the Belastingdienst.

Return ONLY a JSON object with this structure:
{
  "taxYear": 2023,
  "entries": [
    {
      "box": "1",
      "field": "Hypotheekrente en kosten voor de eigen woning",
      "accountNumber": "NL12INGB0001234567",
      "amount": 8400
    }
  ]
}

Rules:
- Extract every entry that has a non-zero amount
- box is "1", "2", or "3"
- field is the Dutch label exactly as it appears in the document
- Box 3 investments: the aangifte lists each investment account in a table with columns "Naam", "Nummer", and "Waarde op 01-01-20XX". Extract each row as a separate entry — the field is the investment name (e.g. "ASN Themabeleggen"), the accountNumber is the IBAN or account identifier from the "Nummer" column, and the amount is the "Waarde" (balance). These balance entries are distinct from the dividend sub-entries ("Brutodividend op aandelen of rente op obligaties") that appear below them — extract both separately. For DEGIRO, the account identifier may span multiple columns (e.g. "johndoe / flatexDEGIRO Bank AG / 0532013000") — concatenate these into a single accountNumber string
- accountNumber is the IBAN associated with that entry, or null if none is shown. Dutch IBANs are always 18 characters (NL + 2 digits + 4-letter bank code + 10 digits = NL##BBBB##########). IBANs are sometimes split across two lines in the PDF — the amount for that entry will appear on the continuation line, after the final digits of the IBAN. Reconstruct the full 18-character IBAN and associate the amount from the continuation line with it (e.g. "ING Betaalrekening NL22 INGB 0673 / 3457 85   € 3.080" → accountNumber "NL22 INGB 0673 3457 85", amount 3080). If the field label embeds a non-IBAN account identifier (e.g. "Bankrekening: ING Creditcardrekening 2100 3093 2649"), extract that identifier into accountNumber as-is, including any spaces — the analyzer normalises whitespace when matching. Mortgage entries may use a "Nummer" prefix instead of the standard "Aftrekbare rente van schuld" pattern — for example "Nummer 1926.58.069 / Betaalde rente in 2025: €105" must be extracted as a box 1 entry with accountNumber "Nummer1926.58.069" and amount -105 (negative, as it is a deduction)
- amount is a signed number in euros. Preserve sign: negative entries (e.g. a credit-card debt under "Bankrekeningen") stay negative
- Return ONLY the raw JSON object, no markdown fences, no explanation`;

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
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

async function extract<T>(pdfBase64: string, opts: ExtractOpts<T>, apiKey?: string): Promise<T> {
  const cached = readCache<T>(pdfBase64);
  if (cached) return cached;

  const client = new Anthropic(apiKey ? { apiKey } : {});
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
  apiKey?: string
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
    apiKey
  );
}

export function extractTaxReturn(pdfBase64: string, apiKey?: string): Promise<TaxReturnData> {
  return extract(
    pdfBase64,
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
