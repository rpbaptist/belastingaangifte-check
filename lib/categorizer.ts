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
import { resolveAmountOverride } from "./field-mapping";

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
    if (!category) continue;
    for (const [key, val] of Object.entries(category)) {
      if (val !== undefined && val !== 0 && key !== "remainingDebt") return val;
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

export function isEndOfYearAccount(statement: AnnualStatementData, account: AccountData): boolean {
  return account.description.toLowerCase().includes(`31 december ${statement.taxYear}`);
}

// A mortgage where interestPaid / remainingDebt < 3% was likely discharged mid-year
// (e.g. €104 on €89,956 ≈ 0.1%). Not a filing omission — suppress from notFilledIn.
export function isMidYearClosedMortgage(account: AccountData): boolean {
  const m = account.amounts.mortgage;
  if (!m?.interestPaid || !m.remainingDebt) return false;
  return m.interestPaid / m.remainingDebt < 0.03;
}

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
    notFilledIn: dedupeBy(notFilledIn, (n) => `${n.accountNumber}|${n.description}`),
    amountMismatches,
  };
}
