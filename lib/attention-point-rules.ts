import type { MatchedPair, UnmatchedJaaropgave } from "./account-matcher";
import type { AccountData, AnnualStatementData, AttentionPoint } from "./types";

const BOX3_THRESHOLD: Record<number, number> = {
  2024: 57_000,
  2025: 57_000,
};
const DEFAULT_BOX3_THRESHOLD = 57_000;

function getBox3Threshold(taxYear: number): number {
  return BOX3_THRESHOLD[taxYear] ?? DEFAULT_BOX3_THRESHOLD;
}

function allJaaropgaveAccounts(
  matched: MatchedPair[],
  onlyInJaaropgave: UnmatchedJaaropgave[],
): Array<{ statement: AnnualStatementData; account: AccountData }> {
  return [
    ...matched.map((p) => p.jaaropgave),
    ...onlyInJaaropgave,
  ];
}

function formatEuroNL(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function buildDeterministicAttentionPoints(
  matched: MatchedPair[],
  onlyInJaaropgave: UnmatchedJaaropgave[],
  taxYear: number,
): AttentionPoint[] {
  const accounts = allJaaropgaveAccounts(matched, onlyInJaaropgave);
  const points: AttentionPoint[] = [];

  // Aflossingsvrij hypotheek — one attention point per unique statement
  const seenAflossingsvrij = new Set<AnnualStatementData>();
  for (const { statement } of accounts) {
    if (
      statement.metadata["mortgageType"] === "aflossingsvrij" &&
      !seenAflossingsvrij.has(statement)
    ) {
      seenAflossingsvrij.add(statement);
      points.push({
        title: "Aflossingsvrij hypotheek",
        explanation:
          "De jaaropgave toont een aflossingsvrij product. Controleer of hypotheekrenteaftrek nog van toepassing is op basis van de ingangsdatum van de hypotheek.",
        institution: statement.institution,
      });
    }
  }

  // Buitenlands dividend — one attention point per triggering account
  for (const { statement, account } of accounts) {
    const broker = account.amounts["broker"];
    if ((broker?.["foreignDividend"] ?? 0) > 0 || (broker?.["foreignWithholdingTax"] ?? 0) > 0) {
      points.push({
        title: "Buitenlands dividend",
        explanation:
          "De jaaropgave toont buitenlands dividend of buitenlandse bronbelasting. Controleer of verrekening van buitenlandse bronbelasting in de aangifte is toegepast.",
        institution: statement.institution,
        accountNumber: account.accountNumber,
      });
    }
  }

  // Saldo boven vrijstelling — one attention point for the whole tax return
  const threshold = getBox3Threshold(taxYear);
  let totalBox3 = 0;
  for (const { account } of accounts) {
    totalBox3 += (account.amounts["bank"]?.["balance"] ?? 0) + (account.amounts["broker"]?.["balance"] ?? 0);
  }
  if (totalBox3 > threshold) {
    points.push({
      title: "Saldo boven vrijstelling",
      explanation:
        `Het totale box 3 vermogen (${formatEuroNL(totalBox3)}) overschrijdt de heffingsvrij vermogen grens van ${formatEuroNL(threshold)} per persoon in ${taxYear}. Controleer of het fictief rendement correct is verwerkt in de aangifte. Bij een fiscaal partner geldt een vrijstelling van ${formatEuroNL(threshold * 2)}.`,
    });
  }

  return points;
}
