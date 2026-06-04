import type { MatchedPair } from "./account-matcher";
import type { AccountData, AnnualStatementData, CoveredItem } from "./types";

type FieldRouter = {
  matches: (field: string, statement: AnnualStatementData) => boolean;
  getAmount: (account: AccountData) => number | null;
  /** When true, compare Math.abs(aangifte.amount) against jaaropgave amount */
  useAbsoluteAangifte?: boolean;
};

const FIELD_ROUTERS: FieldRouter[] = [
  {
    matches: (field) => /ingehouden dividendbelasting/i.test(field),
    getAmount: (acct) => acct.amounts["broker"]?.["dutchDividendTax"] ?? null,
  },
  {
    matches: (field) => /buitenlandse bron/i.test(field),
    getAmount: (acct) => acct.amounts["broker"]?.["foreignWithholdingTax"] ?? null,
  },
  {
    // Standalone dividend income line — checked after the tax-specific rules above
    matches: (field) => /dividend/i.test(field),
    getAmount: (acct) => acct.amounts["broker"]?.["dividend"] ?? null,
  },
  {
    matches: (_field, statement) => statement.institutionType === "mortgage",
    getAmount: (acct) => acct.amounts["mortgage"]?.["interestPaid"] ?? null,
    useAbsoluteAangifte: true,
  },
  {
    // Geldrekening split — broker side
    matches: (field) => /belegg(ing|ingen)|fondsen/i.test(field),
    getAmount: (acct) => acct.amounts["broker"]?.["balance"] ?? null,
  },
  {
    // Geldrekening split — bank/cash side
    matches: (field) => /geldrekening|spaar/i.test(field),
    getAmount: (acct) => acct.amounts["bank"]?.["balance"] ?? null,
  },
  {
    matches: (_field, statement) => statement.institutionType === "bank",
    getAmount: (acct) => acct.amounts["bank"]?.["balance"] ?? null,
  },
  {
    // Single-component broker account (no geldrekening split)
    matches: (_field, statement) => statement.institutionType === "broker",
    getAmount: (acct) => acct.amounts["broker"]?.["balance"] ?? acct.amounts["bank"]?.["balance"] ?? null,
  },
  {
    matches: (field) => /loon|inkomsten uit werk/i.test(field),
    getAmount: (acct) => acct.amounts["wage"]?.["taxableWage"] ?? acct.amounts["wage"]?.["grossWage"] ?? null,
  },
  {
    matches: (field) => /arbeidsongeschiktheid/i.test(field),
    getAmount: (acct) => acct.amounts["other"]?.["premiumPaid"] ?? null,
    useAbsoluteAangifte: true,
  },
];

function resolveAmount(pair: MatchedPair): { amount: number; useAbsolute: boolean } | null {
  const { aangifte, jaaropgave: { statement, account } } = pair;
  for (const router of FIELD_ROUTERS) {
    if (router.matches(aangifte.field, statement)) {
      const amount = router.getAmount(account);
      if (amount !== null) {
        return { amount, useAbsolute: router.useAbsoluteAangifte ?? false };
      }
    }
  }
  return null;
}

export function buildCovered(matched: MatchedPair[]): CoveredItem[] {
  // Group dutchDividendTax pairs by account — aangifte may split them across multiple entries
  const dutchDivGroups = new Map<AccountData, MatchedPair[]>();
  const regularPairs: MatchedPair[] = [];

  for (const pair of matched) {
    if (/ingehouden dividendbelasting/i.test(pair.aangifte.field)) {
      const group = dutchDivGroups.get(pair.jaaropgave.account) ?? [];
      group.push(pair);
      dutchDivGroups.set(pair.jaaropgave.account, group);
    } else {
      regularPairs.push(pair);
    }
  }

  const covered: CoveredItem[] = [];

  for (const pair of regularPairs) {
    const resolved = resolveAmount(pair);
    if (!resolved) continue;
    const { amount, useAbsolute } = resolved;
    const aangifteAmt = useAbsolute ? Math.abs(pair.aangifte.amount) : pair.aangifte.amount;
    if (Math.abs(aangifteAmt - amount) > 1) continue;
    covered.push({
      field: pair.aangifte.field,
      accountNumber: pair.aangifte.accountNumber ?? pair.jaaropgave.account.accountNumber,
      institution: pair.jaaropgave.statement.institution,
      amountTaxReturn: pair.aangifte.amount,
      amountStatement: amount,
    });
  }

  for (const [account, pairs] of dutchDivGroups) {
    const jaaropgaveAmount = account.amounts["broker"]?.["dutchDividendTax"] ?? null;
    if (jaaropgaveAmount === null) continue;
    const totalAangifte = pairs.reduce((sum, p) => sum + p.aangifte.amount, 0);
    if (Math.abs(totalAangifte - jaaropgaveAmount) > 1) continue;
    covered.push({
      field: pairs.length === 1 ? pairs[0].aangifte.field : "Ingehouden dividendbelasting",
      accountNumber: pairs[0].aangifte.accountNumber ?? account.accountNumber,
      institution: pairs[0].jaaropgave.statement.institution,
      amountTaxReturn: totalAangifte,
      amountStatement: jaaropgaveAmount,
    });
  }

  return covered;
}
