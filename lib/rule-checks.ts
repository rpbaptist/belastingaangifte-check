import type { AnnualStatementData, AttentionPoint } from "./types";
import type { Language } from "./translations";
import { translate } from "./translations";
import { formatEuro } from "./format";

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

const RULE_TEXT = {
  aflossingsvrij: {
    nl: {
      title: "Aflossingsvrij hypotheek",
      explanation:
        "De jaaropgave toont een aflossingsvrij product. Controleer of de hypotheekrenteaftrek nog van toepassing is — afhankelijk van de ingangsdatum van de hypotheek kan de aftrekperiode beperkt zijn.",
    },
    en: {
      title: "Interest-only mortgage",
      explanation:
        "The annual income statement shows an interest-only mortgage product. Check whether the mortgage interest deduction still applies — depending on the mortgage's start date, the deduction period may be limited.",
    },
  },
  buitenlandsDividend: {
    nl: {
      title: "Buitenlands dividend",
      explanation:
        "De jaaropgave toont buitenlands dividend of ingehouden buitenlandse bronbelasting. Controleer of de verrekening van buitenlandse bronbelasting correct is opgenomen in de aangifte.",
    },
    en: {
      title: "Foreign dividend",
      explanation:
        "The annual income statement shows foreign dividend or withheld foreign withholding tax. Check whether the offset of foreign withholding tax is correctly included in the tax return.",
    },
  },
} as const;

export function runRuleChecks(
  annualStatements: AnnualStatementData[],
  taxYear: number,
  language: Language = "nl"
): AttentionPoint[] {
  const points: AttentionPoint[] = [];
  let totalBox3 = 0;

  for (const statement of annualStatements) {
    if (statement.metadata.mortgageType === "aflossingsvrij") {
      points.push({
        ...RULE_TEXT.aflossingsvrij[language],
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
          ...RULE_TEXT.buitenlandsDividend[language],
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
      title: translate("assetsAboveThresholdTitle", language),
      explanation: translate("assetsAboveThresholdExplanation", language)
        .replace("{total}", formatEuro(totalBox3))
        .replace("{threshold}", formatEuro(threshold)),
    });
  }

  return points;
}
