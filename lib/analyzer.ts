import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import type { AnalysisReport, AnnualStatementData, TaxReturnData } from "./types";
import { z } from "zod";
import { parseLlmJson } from "./parse-llm-json";
import { matchEntries } from "./account-matcher";
import { AnalysisReportSchema } from "./schemas";

const MODEL = "claude-sonnet-4-6";

function loadRules(): string {
  const rulesPath = path.join(process.cwd(), "rules", "aandachtspunten.md");
  try {
    return fs.readFileSync(rulesPath, "utf-8");
  } catch {
    throw new Error(`Kon aandachtspunten-regels niet laden: ${rulesPath}`);
  }
}

const RULES = loadRules();

function buildSystemPrompt(rules: string): string {
  return `You are a Dutch tax analyst. You receive pre-matched data from a belastingaangifte and one or more jaaropgaves, and produce a structured comparison report.

Account number matching has already been done in code — do not re-match. Work only with the pre-matched structure provided.

## Amount comparison

Amounts match when they are within €1 of each other. The Belastingdienst allows taxpayers to round amounts to whichever full euro is most favorable: deductions may be rounded up, income and assets may be rounded down. Jaaropgaves show exact cents. A difference of €1 or less between the aangifte and the jaaropgave is therefore expected and correct — treat it as matching.

Signs are part of the value: -102 does not match 102. Negative balances (credit-card debt, overdraft) must be compared with their sign preserved.

For bank/broker balances (box 3): the aangifte uses the balance on 1 januari of the tax year. A jaaropgave may report this as "saldo per 1 januari [taxYear]" or as "saldo per 31 december [taxYear-1]" — these are the same date. If the jaaropgave only shows "saldo per 31 december [taxYear]", that balance belongs to the NEXT year's aangifte.

Broker accounts with a geldrekening component: some broker jaaropgaves (e.g. ASN Themabeleggen) carry both a geldrekening (cash, in amounts.bank.balance) and a beleggingsrekening (portfolio, in amounts.broker.balance). The aangifte lists these separately in box 3 under the same accountNumber. When matching, compare the aangifte's geldrekening entry against amounts.bank.balance and the aangifte's beleggingen entry against amounts.broker.balance — not against the sum. Both matching correctly is **covered**.

Dividend tax mapping (broker jaaropgaves):
- aangifte field "Ingehouden dividendbelasting" (a box 1 voorheffing) → jaaropgave's broker.dutchDividendTax for the same accountNumber. If multiple aangifte entries cover the same account, sum them when comparing.
- aangifte field "Verrekenbare buitenlandse bronbelasting" / "Buitenlandse bronheffing" → jaaropgave's broker.foreignWithholdingTax.
- aangifte field "Dividend" (box 2 or box 3 income line) → jaaropgave's broker.dividend.
A correctly-reported voorheffing belongs in **covered**, not **attentionPoints**.

## Report categories

- **covered**: matched pair where amounts agree (within €1)
- **missingStatement**: aangifte entry from the unmatched aangifte list — jaaropgave was not uploaded. Exception: box 1 wage entries (field contains "Loon", accountNumber null) cannot be matched by account number. Do NOT put them in missingStatement if a wage jaaropgave is present in the unmatched jaaropgave list (institutionType "other" with amounts.wage.taxableWage within €1 of the aangifte amount). Treat that pair as **covered** instead.
- **notFilledIn**: jaaropgave account from the unmatched jaaropgave list with a non-zero amount but absent or zero in the aangifte. Zero-balance accounts must NOT be reported.
- **attentionPoints**: substantive flags based on document content. Only emit an attention point when there is something actionable to flag. Never emit a "non-issue" attention point. If a rule's condition is not met, simply omit the attention point.

A matched pair always belongs in **covered**, even when the underlying account had unusual lifecycle events (mortgage discharged mid-year, account opened or closed during the tax year, partial-year interest). Only escalate to **attentionPoints** when the document content reveals a substantive risk AND that risk is not already addressed by a correctly-reported amount.

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
  annualStatements: AnnualStatementData[],
  apiKey?: string
): Promise<Omit<AnalysisReport, "extractionErrors">> {
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const { matched, onlyInAangifte, onlyInJaaropgave } = matchEntries(taxReturn, annualStatements);

  const userMessage = [
    "## Matched pairs (account numbers resolved by code)",
    "",
    JSON.stringify(matched, null, 2),
    "",
    `## Aangifte entries without matching jaaropgave (${onlyInAangifte.length})`,
    "",
    JSON.stringify(onlyInAangifte, null, 2),
    "",
    `## Jaaropgave accounts without matching aangifte entry (${onlyInJaaropgave.length})`,
    "",
    JSON.stringify(onlyInJaaropgave, null, 2),
    "",
    "Produce the analysis report. Respond with the raw JSON object only — start your response with `{`.",
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(RULES),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("Analyse afgebroken — te veel posten om te verwerken. Probeer met minder jaaropgaves tegelijk.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Geen reactie ontvangen tijdens de analyse");
  }

  const raw = parseLlmJson(textBlock.text);
  try {
    return AnalysisReportSchema.parse(raw);
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "onverwacht formaat";
    throw new Error(`Analyse mislukt: ${msg}`);
  }
}
