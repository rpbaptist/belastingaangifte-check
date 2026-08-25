import type { AmountMismatch } from "../categorizer";

export function buildUserMessage(
  amountMismatches: AmountMismatch[],
  covered: { accountNumber: string; institution: string }[]
): string {
  const parts: string[] = [];

  parts.push(
    "## Amount mismatches (review each — amounts differ by more than €1)",
    "",
    JSON.stringify(amountMismatches, null, 2),
    ""
  );

  parts.push(
    "## Covered accounts (already reconciled by code — do NOT raise issues about completeness for these)",
    "",
    JSON.stringify(
      covered.map((c) => ({ institution: c.institution, accountNumber: c.accountNumber })),
      null,
      2
    ),
    "",
    "Generate the attentionPoints. Respond with the raw JSON object only — start your response with `{`."
  );

  return parts.join("\n");
}

export function buildAnalyzerPrompt(rules: string, retrievedContext: string = ""): string {
  return `You are a tax analyst specialized in Dutch tax law. The reconciliation between tax return and annual income statements has been done by code. You will receive the list of already-covered accounts — do NOT raise attentionPoints questioning whether those accounts appear in the tax return; that check is already done. Your job is to review amount mismatches and generate attentionPoints for anything a Dutch tax expert would flag.

## Amount mismatches

You will receive matched pairs where the tax return and annual income statement disagree by more than €1. For each:
- Determine whether the difference is a real filing error or an expected lifecycle event (partial-year interest, account opened or closed mid-year, mid-year mortgage payoff)
- If it is a real issue, generate an attentionPoint
- If it is a lifecycle event that does not represent a filing error, do NOT generate an attentionPoint

## Additional attentionPoints rules

${rules}

${retrievedContext ? `## Official sources (Belastingdienst.nl, to support your judgment)\n\n${retrievedContext}\n\n` : ""}## Output

Your response must be a single raw JSON object — nothing before the opening brace, nothing after the closing brace. No markdown fences, no prose, no explanation.

{
  "attentionPoints": [
    {
      "title": "Amount differs",
      "explanation": "The tax return shows €8.400 but the annual income statement shows €9.200. Check whether the correct amount was entered.",
      "institution": "Mortgage provider",
      "accountNumber": "1926.58.069"
    }
  ]
}

If there are no attentionPoints to report, return: {"attentionPoints": []}

Write the \`title\` and \`explanation\` values in the output JSON in English.`;
}
