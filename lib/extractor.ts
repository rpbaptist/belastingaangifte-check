import Anthropic from "@anthropic-ai/sdk";
import type { AnnualStatementData, TaxReturnData } from "./types";

const client = new Anthropic();
const MODEL = "claude-sonnet-4-6";

const ANNUAL_STATEMENT_SYSTEM = `You are a Dutch tax document analyst. Extract structured data from a jaaropgave (annual statement) PDF.

Return ONLY a JSON object with this structure:
{
  "institution": "Name of the financial institution",
  "institutionType": "bank" | "broker" | "mortgage" | "other",
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
- All amounts are signed integers in full euros — drop cents, round if necessary. Preserve sign: a negative balance (e.g. credit-card debt "saldo -102") must be extracted as -102, not 102
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
- accountNumber is the IBAN associated with that entry, or null if none is shown. If the field label embeds a non-IBAN account identifier (e.g. "Bankrekening: ING Creditcardrekening 2100 3093 2649"), extract that identifier into accountNumber as-is, including any spaces — the analyzer normalises whitespace when matching
- amount is a signed integer in full euros (Belastingdienst always rounds to full euros). Preserve sign: negative entries (e.g. a credit-card debt under "Bankrekeningen") stay negative
- Return ONLY the raw JSON object, no markdown fences, no explanation`;

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

function parseJsonResponse(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Model returned explanatory text instead of JSON (e.g. wrong document type).
    // Surface the model's own message — it's more useful than a SyntaxError.
    const preview = stripped.replace(/\s+/g, " ").trim();
    throw new Error(preview || "Model heeft geen gestructureerde data teruggegeven");
  }
}

export async function extractAnnualStatement(pdfBase64: string): Promise<AnnualStatementData> {
  const response = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: ANNUAL_STATEMENT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          } as Anthropic.DocumentBlockParam,
          {
            type: "text",
            text: "Extract the structured data from this jaaropgave.",
          },
        ],
      },
    ],
  }));

  if (response.stop_reason === "max_tokens") {
    throw new Error("Extractie afgebroken — het PDF is mogelijk te groot of te complex");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Geen reactie ontvangen bij verwerking van de jaaropgave");
  }

  return parseJsonResponse(textBlock.text) as AnnualStatementData;
}

export async function extractTaxReturn(pdfBase64: string): Promise<TaxReturnData> {
  const response = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: TAX_RETURN_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          } as Anthropic.DocumentBlockParam,
          {
            type: "text",
            text: "Extract all non-zero entries from this belastingaangifte.",
          },
        ],
      },
    ],
  }));

  if (response.stop_reason === "max_tokens") {
    throw new Error("Extractie afgebroken — het PDF is mogelijk te groot of te complex");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Geen reactie ontvangen bij verwerking van de aangifte");
  }

  return parseJsonResponse(textBlock.text) as TaxReturnData;
}
