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

// remainingDebt and openingDebt are balance figures (schuld), not declarable amounts — a
// mortgage account with only a debt balance and no interestPaid has nothing to declare, so
// neither key may stand in as the item's display amount.
const BALANCE_ONLY_KEYS = new Set(["remainingDebt", "openingDebt"]);

function primaryDisplayAmount(amounts: AccountAmounts): number {
  for (const category of Object.values(amounts)) {
    if (!category) continue;
    for (const [key, val] of Object.entries(category)) {
      if (val !== undefined && val !== 0 && !BALANCE_ONLY_KEYS.has(key)) return val;
    }
  }
  return 0;
}

export type AmountMismatch = {
  aangifte: TaxReturnEntry;
  jaaropgave: { statement: AnnualStatementData; account: AccountData };
  amountStatement: number;
};

export type DuplicateRowCollapsed =
  | { label: "covered"; row: CoveredItem }
  | { label: "missingStatement"; row: MissingStatementItem }
  | { label: "notFilledIn"; row: NotFilledInItem };

export type CategorizationResult = {
  covered: CoveredItem[];
  missingStatement: MissingStatementItem[];
  notFilledIn: NotFilledInItem[];
  amountMismatches: AmountMismatch[];
  // Matched pairs whose bewijsstuk amount could not be resolved. Its own outcome — never
  // covered — so an unreadable line is never echoed back as a confirmed match. `buildReport`
  // turns these into findings (ADR 0008).
  unresolved: MatchedPair[];
  duplicateRowsCollapsed: DuplicateRowCollapsed[];
};

export function isEndOfYearAccount(statement: AnnualStatementData, account: AccountData): boolean {
  return account.description.toLowerCase().includes(`31 december ${statement.taxYear}`);
}

// A mortgage where interest paid is a tiny fraction of the debt was likely discharged
// mid-year (e.g. €104 on €89,956 ≈ 0.1%). Not a filing omission — suppress from
// notFilledIn. A fully repaid mortgage reports a remaining debt of zero, so fall back
// to the opening debt (schuld op 1 januari) so the ratio can still be judged; without
// either debt figure there is nothing to judge against and we leave it reported.
export function isMidYearClosedMortgage(account: AccountData): boolean {
  const m = account.amounts.mortgage;
  if (!m?.interestPaid) return false;
  const debt = m.remainingDebt || m.openingDebt;
  if (!debt) return false;
  return m.interestPaid / debt < 0.03;
}

// Collapses rows that are fully identical (an extraction artifact), never rows that merely
// share a key. Two positions with the same account and field but different amounts (e.g. the
// bank and broker components of one ASN Themabeleggen holding) are real and both survive.
// Every collapse is reported on `collapsed` rather than dropped silently.
function collapseExactDuplicates<T extends CoveredItem>(
  arr: T[],
  label: "covered",
  collapsed: DuplicateRowCollapsed[],
  key: (item: T) => string
): T[];
function collapseExactDuplicates<T extends MissingStatementItem>(
  arr: T[],
  label: "missingStatement",
  collapsed: DuplicateRowCollapsed[],
  key: (item: T) => string
): T[];
function collapseExactDuplicates<T extends NotFilledInItem>(
  arr: T[],
  label: "notFilledIn",
  collapsed: DuplicateRowCollapsed[],
  key: (item: T) => string
): T[];
function collapseExactDuplicates<T extends CoveredItem | MissingStatementItem | NotFilledInItem>(
  arr: T[],
  label: DuplicateRowCollapsed["label"],
  collapsed: DuplicateRowCollapsed[],
  key: (item: T) => string
): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) {
      collapsed.push({ label, row: item } as DuplicateRowCollapsed);
      return false;
    }
    seen.add(k);
    return true;
  });
}

const coveredKey = (c: CoveredItem): string =>
  `${c.field}|${c.accountNumber}|${c.institution}|${c.amountTaxReturn}|${c.amountStatement}`;
const missingStatementKey = (m: MissingStatementItem): string =>
  `${m.field}|${m.accountNumber}|${m.amount}|${m.box}`;
const notFilledInKey = (n: NotFilledInItem): string =>
  `${n.accountNumber}|${n.institution}|${n.description}|${n.amount}`;

export function categorize(matchResult: MatchResult): CategorizationResult {
  const covered: CoveredItem[] = [];
  const amountMismatches: AmountMismatch[] = [];
  const unresolved: MatchedPair[] = [];

  for (const pair of matchResult.matched) {
    const amountStatement = getJaaropgaveAmount(pair);

    if (amountStatement == null) {
      // Its own outcome. Reporting the aangifte figure here as `amountStatement` would echo
      // the filer's own number back as though a bewijsstuk confirmed it.
      unresolved.push(pair);
    } else if (Math.abs(pair.aangifte.amount - amountStatement) <= 1) {
      covered.push({
        field: pair.aangifte.field,
        accountNumber: pair.aangifte.accountNumber ?? pair.jaaropgave.account.accountNumber,
        institution: pair.jaaropgave.statement.institution,
        amountTaxReturn: pair.aangifte.amount,
        amountStatement,
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

  const duplicateRowsCollapsed: DuplicateRowCollapsed[] = [];

  return {
    covered: collapseExactDuplicates(covered, "covered", duplicateRowsCollapsed, coveredKey),
    missingStatement: collapseExactDuplicates(
      missingStatement,
      "missingStatement",
      duplicateRowsCollapsed,
      missingStatementKey
    ),
    notFilledIn: collapseExactDuplicates(
      notFilledIn,
      "notFilledIn",
      duplicateRowsCollapsed,
      notFilledInKey
    ),
    amountMismatches,
    unresolved,
    duplicateRowsCollapsed,
  };
}
