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
        "broker":   { "dividend": 500, "foreignDividend": 200, "withholdingTax": 30 },
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
- All amounts are integers in full euros — drop cents, round if necessary
- Use English keys for amount names
- metadata holds any non-numeric fields relevant for tax advice (e.g. mortgageType)
- Omit fields you cannot determine — never guess
- Return ONLY the raw JSON object, no markdown fences, no explanation`;

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
- accountNumber is the IBAN associated with that entry, or null if none is shown
- amount is an integer in full euros (Belastingdienst always rounds to full euros)
- Return ONLY the raw JSON object, no markdown fences, no explanation`;

function parseJsonResponse(text: string): unknown {
  const stripped = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
  return JSON.parse(stripped);
}

export async function extractAnnualStatement(
  pdfBase64: string
): Promise<AnnualStatementData> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: ANNUAL_STATEMENT_SYSTEM,
        // @ts-expect-error cache_control is supported but not yet in all SDK type definitions
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
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM during annual statement extraction");
  }

  return parseJsonResponse(textBlock.text) as AnnualStatementData;
}

export async function extractTaxReturn(
  pdfBase64: string
): Promise<TaxReturnData> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: TAX_RETURN_SYSTEM,
        // @ts-expect-error cache_control is supported but not yet in all SDK type definitions
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
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM during tax return extraction");
  }

  return parseJsonResponse(textBlock.text) as TaxReturnData;
}
