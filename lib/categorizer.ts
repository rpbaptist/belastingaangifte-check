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
        // Both components present (cash + portfolio). Pick the one closest to the aangifte
        // amount so that products like ASN Themabeleggen (larger balance in bank.balance)
        // don't get compared against the wrong component.
        const aangifte = pair.aangifte.amount;
        return Math.abs(aangifte - bankBalance) <= Math.abs(aangifte - brokerBalance)
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
    for (const [key, val] of Object.entries(category)) {
      if (val !== 0 && key !== "remainingDebt") return val;
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

function dedupeBy<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

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

  // A mortgage with very low interest relative to remaining debt was likely discharged mid-year
  // (e.g. €104 interest on €89,956 debt ≈ 0.1%). Not a filing omission.
  const isMidYearClosedMortgage = (account: AccountData): boolean => {
    const m = account.amounts.mortgage;
    if (!m?.interestPaid || !m.remainingDebt) return false;
    return m.interestPaid / m.remainingDebt < 0.03;
  };

  const notFilledIn: NotFilledInItem[] = matchResult.onlyInJaaropgave
    .filter(
      ({ statement, account }) =>
        primaryDisplayAmount(account.amounts) !== 0 &&
        !isEndOfYearAccount(statement, account) &&
        !isMidYearClosedMortgage(account)
    )
    .map(({ statement, account }) => ({
      accountNumber: account.accountNumber,
      institution: statement.institution,
      description: account.description,
      amount: primaryDisplayAmount(account.amounts),
    }));

  return {
    covered: dedupeBy(covered, (c) => `${c.accountNumber}|${c.field}`),
    missingStatement: dedupeBy(missingStatement, (m) => `${m.accountNumber}|${m.field}`),
    notFilledIn: dedupeBy(notFilledIn, (n) => n.accountNumber),
    amountMismatches,
  };
}
