import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { readCache, writeCache } from "./extraction-cache";
import { parseLlmJson } from "./parse-llm-json";
import { AnnualStatementSchema, TaxReturnSchema } from "./schemas";
import { extractTaxYear } from "./tax-year-extractor";

const MODEL = "claude-haiku-4-5-20251001";

const ANNUAL_STATEMENT_SYSTEM = `You are a Dutch tax document analyst. Extract structured data from the text content of a jaaropgave (annual statement).

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
- Extract account numbers and identifiers exactly as they appear in the document — do not mask, redact, or abbreviate them (e.g. write "johndoe" not "******doe")
- Return ONLY the raw JSON object, no markdown fences, no explanation
- IMPORTANT — balance date for box 3: the Belastingdienst uses the balance on 1 januari of the tax year (= 31 december of the preceding year). If the jaaropgave shows both a "saldo per 1 januari [taxYear]" and a "saldo per 31 december [taxYear]", use the 1 januari balance. If only 31 december is shown, that is the correct balance for the FOLLOWING tax year's aangifte — set balance to that value but note it is end-of-year
- Broker accounts with a geldrekening/cash component: many broker jaaropgaves show two separate components per 1 januari — a cash balance and a portfolio (beleggingen) value. The aangifte lists these separately in box 3. When both are present, put them in the SAME account entry: { "bank": { "balance": <cash per 1 jan> }, "broker": { "balance": <portfolio per 1 jan, EXCLUDING cash>, "dividend": ... } }. Do NOT combine them into a single number. For DEGIRO specifically: the "Totale portefeuillewaarde" includes the CASH & CASH FUND — the broker.balance should be the total MINUS the CASH & CASH FUND amount, and bank.balance should be the CASH & CASH FUND amount.`;

const TAX_RETURN_SYSTEM = `You are a Dutch tax document analyst. Extract structured data from the text content of a belastingaangifte (income tax return) issued by the Belastingdienst.

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
- Use the tax year supplied above as taxYear in your output
- Extract every entry that has a non-zero amount
- box is "1", "2", or "3"
- field is the Dutch label exactly as it appears in the document
- Box 3 investments: the aangifte lists each investment account in a table with columns "Naam", "Nummer", and "Waarde op 01-01-20XX". Extract each row as a separate entry — the field is the investment name (e.g. "ASN Themabeleggen"), the accountNumber is the identifier from the "Nummer" column (IBANs appear as IBAN-BANKCODE-NNN pseudonyms — use them as-is), and the amount is the "Waarde" (balance). These balance entries are distinct from the dividend sub-entries ("Brutodividend op aandelen of rente op obligaties") that appear below them — extract both separately. For DEGIRO, the account identifier may span multiple columns (e.g. "johndoe / flatexDEGIRO Bank AG / 1019345793") — concatenate these into a single accountNumber string
- accountNumber is the identifier associated with that entry, or null if none is shown. Dutch IBANs appear as IBAN-BANKCODE-NNN pseudonyms in the text — extract them exactly as shown. If the field label embeds a non-IBAN account identifier (e.g. "Bankrekening: ING Creditcardrekening 2100 3093 2649"), extract that identifier into accountNumber as-is, including any spaces. Mortgage entries may use a "Nummer" prefix instead of the standard "Aftrekbare rente van schuld" pattern. In the extracted text they appear as a block: "Nummer[accountnumber] ... Schuld op 1 januari [year] €[amount] Schuld op 31 december [year] €[amount] Betaalde rente in [year] €[amount]". Extract ONLY the "Betaalde rente" as a box 1 entry with accountNumber "Nummer[accountnumber]" and a negative amount (it is a deduction). Do NOT extract "Schuld op 1 januari" or "Schuld op 31 december" as separate entries — those are balance declarations, not income/deduction entries. Example: text contains "Nummer192658069 ... Betaalde rente in 2025 €105" → extract accountNumber "Nummer192658069", amount -105
- amount is a signed number in euros. Preserve sign: negative entries (e.g. a credit-card debt under "Bankrekeningen") stay negative
- Return ONLY the raw JSON object, no markdown fences, no explanation`;

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
