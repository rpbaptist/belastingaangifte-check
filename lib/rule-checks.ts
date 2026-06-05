import type { AnnualStatementData, AttentionPoint } from "./types";

const HEFFINGSVRIJ_VERMOGEN: Record<number, number> = {
  2021: 50000,
  2022: 50650,
  2023: 57000,
  2024: 57000,
  2025: 57000,
};

function getThreshold(taxYear: number): number {
  return HEFFINGSVRIJ_VERMOGEN[taxYear] ?? 57000;
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function runRuleChecks(
  annualStatements: AnnualStatementData[],
  taxYear: number
): AttentionPoint[] {
  const points: AttentionPoint[] = [];
  let totalBox3 = 0;

  for (const statement of annualStatements) {
    if (statement.metadata.mortgageType === "aflossingsvrij") {
      points.push({
        title: "Aflossingsvrij hypotheek",
        explanation:
          "De jaaropgave toont een aflossingsvrij product. Controleer of de hypotheekrenteaftrek nog van toepassing is — afhankelijk van de ingangsdatum van de hypotheek kan de aftrekperiode beperkt zijn.",
        institution: statement.institution,
        accountNumber: statement.accounts[0]?.accountNumber,
      });
    }

    for (const account of statement.accounts) {
      const broker = account.amounts.broker;
      if (
        broker &&
        ((broker.foreignDividend ?? 0) > 0 || (broker.foreignWithholdingTax ?? 0) > 0)
      ) {
        points.push({
          title: "Buitenlands dividend",
          explanation:
            "De jaaropgave toont buitenlands dividend of ingehouden buitenlandse bronbelasting. Controleer of de verrekening van buitenlandse bronbelasting correct is opgenomen in de aangifte.",
          institution: statement.institution,
          accountNumber: account.accountNumber,
        });
      }

      // Sum positive box 3 asset balances (negative = debt, does not count toward threshold)
      totalBox3 += Math.max(0, account.amounts.bank?.balance ?? 0);
      totalBox3 += Math.max(0, account.amounts.broker?.balance ?? 0);
    }
  }

  const threshold = getThreshold(taxYear);
  if (totalBox3 > threshold) {
    points.push({
      title: "Vermogen boven heffingsvrij vermogen",
      explanation: `De totale box 3 activa bedragen circa ${formatEuro(totalBox3)}, wat de vrijstelling van ${formatEuro(threshold)} (voor één persoon) overstijgt. Controleer of het fictief rendement correct is berekend in de aangifte.`,
    });
  }

  return points;
}
