import type { MatchResult, MatchedPair } from "./reconciler";
import type {
  TaxReturnEntry,
  AnnualStatementData,
  AccountData,
  AccountAmounts,
  CoveredItem,
  MissingStatementItem,
  NotFilledInItem,
} from "./types";

// Maps aangifte field name fragments (lowercase) to jaaropgave amount paths.
// negate: true → jaaropgave stores a positive value but aangifte is negative (deductions).
// Order matters: more specific patterns must precede substrings they contain.
const FIELD_AMOUNT_OVERRIDES: Array<{
  fieldIncludes: string;
  amountPath: [string, string];
  negate?: boolean;
}> = [
  { fieldIncludes: "ingehouden dividendbelasting", amountPath: ["broker", "dutchDividendTax"] },
  { fieldIncludes: "dividendbelasting", amountPath: ["broker", "dutchDividendTax"] },
  { fieldIncludes: "buitenlandse bronbelasting", amountPath: ["broker", "foreignWithholdingTax"] },
  { fieldIncludes: "bronheffing", amountPath: ["broker", "foreignWithholdingTax"] },
  { fieldIncludes: "brutodividend", amountPath: ["broker", "dividend"] },
  { fieldIncludes: "loon", amountPath: ["wage", "taxableWage"] },
  { fieldIncludes: "inkomsten uit werk", amountPath: ["wage", "taxableWage"] },
  { fieldIncludes: "arbeidsongeschiktheid", amountPath: ["other", "premiumPaid"], negate: true },
  // "rente" catches hypotheekrente and betaalde rente — always a deduction (negative in aangifte)
  { fieldIncludes: "rente", amountPath: ["mortgage", "interestPaid"], negate: true },
  // "dividend" must come after "dividendbelasting" / "brutodividend" to avoid false matches
  { fieldIncludes: "dividend", amountPath: ["broker", "dividend"] },
];

function resolveAmountOverride(fieldLower: string, amounts: AccountAmounts): number | null {
  for (const { fieldIncludes, amountPath, negate } of FIELD_AMOUNT_OVERRIDES) {
    if (!fieldLower.includes(fieldIncludes)) continue;
    const val = amounts[amountPath[0]]?.[amountPath[1]];
    if (val == null) continue;
    return negate ? -val : val;
  }
  return null;
}

function getJaaropgaveAmount(pair: MatchedPair): number | null {
  const fieldLower = pair.aangifte.field.toLowerCase();
  const amounts = pair.jaaropgave.account.amounts;
  const institutionType = pair.jaaropgave.statement.institutionType;

  const override = resolveAmountOverride(fieldLower, amounts);
  if (override !== null) return override;

  switch (institutionType) {
    case "bank":
      return amounts.bank?.balance ?? null;
    case "broker": {
      const bankBalance = amounts.bank?.balance;
      const brokerBalance = amounts.broker?.balance;
      if (bankBalance != null && brokerBalance != null) {
        // Geldrekening vs beleggingen: use field heuristic
        return fieldLower.includes("geld") || fieldLower.includes("spaar")
          ? bankBalance
          : brokerBalance;
      }
      return brokerBalance ?? bankBalance ?? null;
    }
    case "mortgage":
      // Unrecognised mortgage field — fall back to interest as primary amount (negated)
      return amounts.mortgage?.interestPaid != null ? -amounts.mortgage.interestPaid : null;
    default:
      return null;
  }
}

function primaryDisplayAmount(amounts: AccountAmounts): number {
  for (const category of Object.values(amounts)) {
    for (const val of Object.values(category)) {
      if (val !== 0) return val;
    }
  }
  return 0;
}

export type AmountMismatch = {
  aangifte: TaxReturnEntry;
  jaaropgave: { statement: AnnualStatementData; account: AccountData };
  amountStatement: number;
};

export type CategorizationResult = {
  covered: CoveredItem[];
  missingStatement: MissingStatementItem[];
  notFilledIn: NotFilledInItem[];
  amountMismatches: AmountMismatch[];
};

export function categorize(matchResult: MatchResult): CategorizationResult {
  const covered: CoveredItem[] = [];
  const amountMismatches: AmountMismatch[] = [];

  for (const pair of matchResult.matched) {
    const amountStatement = getJaaropgaveAmount(pair);

    if (amountStatement == null || Math.abs(pair.aangifte.amount - amountStatement) <= 1) {
      covered.push({
        field: pair.aangifte.field,
        accountNumber: pair.aangifte.accountNumber ?? pair.jaaropgave.account.accountNumber,
        institution: pair.jaaropgave.statement.institution,
        amountTaxReturn: pair.aangifte.amount,
        amountStatement: amountStatement ?? pair.aangifte.amount,
      });
    } else {
      amountMismatches.push({ ...pair, amountStatement });
    }
  }

  const missingStatement: MissingStatementItem[] = matchResult.onlyInAangifte.map((e) => ({
    field: e.field,
    accountNumber: e.accountNumber ?? "",
    amount: e.amount,
    box: e.box,
  }));

  const isEndOfYearAccount = (statement: AnnualStatementData, account: AccountData): boolean =>
    account.description.toLowerCase().includes(`31 december ${statement.taxYear}`);

  const notFilledIn: NotFilledInItem[] = matchResult.onlyInJaaropgave
    .filter(
      ({ statement, account }) =>
        primaryDisplayAmount(account.amounts) !== 0 && !isEndOfYearAccount(statement, account)
    )
    .map(({ statement, account }) => ({
      accountNumber: account.accountNumber,
      institution: statement.institution,
      description: account.description,
      amount: primaryDisplayAmount(account.amounts),
    }));

  return { covered, missingStatement, notFilledIn, amountMismatches };
}
