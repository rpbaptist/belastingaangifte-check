import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { AnalysisReport, AnnualStatementData, TaxReturnData } from "./types";

const client = new Anthropic();
const MODEL = "claude-sonnet-4-6";

function loadRules(): string {
  const rulesPath = path.join(process.cwd(), "rules", "aandachtspunten.md");
  return fs.readFileSync(rulesPath, "utf-8");
}

function buildSystemPrompt(rules: string): string {
  return `You are a Dutch tax analyst. You receive extracted data from a belastingaangifte and one or more jaaropgaves, and produce a structured comparison report.

## Matching

Match aangifte entries to jaaropgave accounts primarily by accountNumber (IBAN). Where no IBAN is available, match by institution type and field context.

Amounts match when they are within €1 of each other. The Belastingdienst allows taxpayers to round amounts to whichever full euro is most favorable: deductions may be rounded up, income and assets may be rounded down. Jaaropgaves show exact cents. A difference of €1 or less between the aangifte and the jaaropgave is therefore expected and correct — treat it as matching.

For bank/broker balances (box 3): the aangifte uses the balance on 1 januari of the tax year. A jaaropgave may report this as "saldo per 1 januari [taxYear]" or as "saldo per 31 december [taxYear-1]" — these are the same date. If the jaaropgave only shows "saldo per 31 december [taxYear]", that balance belongs to the NEXT year's aangifte.

## Report categories

- **covered**: aangifte entry AND matching jaaropgave account found, amounts match
- **missingStatement**: aangifte entry exists but no matching jaaropgave was uploaded
- **notFilledIn**: jaaropgave account exists but missing or zero in the aangifte
- **attentionPoints**: substantive flags based on document content

## Aandachtspunten rules

${rules}

## Output

Your response must be a single raw JSON object — nothing before the opening brace, nothing after the closing brace. No markdown fences, no prose, no explanation. If you write anything other than JSON your response will break the parser.

{
  "taxYear": 2023,
  "covered": [
    {
      "field": "Saldo bank en spaarrekeningen",
      "accountNumber": "NL12INGB0001234567",
      "institution": "ING",
      "amountTaxReturn": 12345,
      "amountStatement": 12345
    }
  ],
  "missingStatement": [
    {
      "field": "Saldo bank en spaarrekeningen",
      "accountNumber": "NL12INGB0001234567",
      "amount": 12345,
      "box": "3"
    }
  ],
  "notFilledIn": [
    {
      "accountNumber": "NL98RABO0123456789",
      "institution": "Rabobank",
      "description": "Spaarrekening",
      "amount": 5000
    }
  ],
  "attentionPoints": [
    {
      "title": "Aflossingsvrij hypotheek",
      "explanation": "De jaaropgave toont een aflossingsvrij product. Controleer of hypotheekrenteaftrek nog van toepassing is.",
      "institution": "Hypotheekverstrekker",
      "accountNumber": null
    }
  ]
}`;
}

export async function analyzeDocuments(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[]
): Promise<Omit<AnalysisReport, "extractionErrors">> {
  const rules = loadRules();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(rules),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `## Belastingaangifte\n\n${JSON.stringify(taxReturn, null, 2)}\n\n## Jaaropgaves (${annualStatements.length})\n\n${JSON.stringify(annualStatements, null, 2)}\n\nProduce the analysis report. Respond with the raw JSON object only — start your response with \`{\`.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from LLM during analysis");
  }

  const json = textBlock.text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();

  return JSON.parse(json) as Omit<AnalysisReport, "extractionErrors">;
}
