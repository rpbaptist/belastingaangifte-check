import { normalize } from "./account-normalizer";
import type { AccountData, AnnualStatementData, TaxReturnData, TaxReturnEntry } from "./types";

export type MatchedPair = {
  aangifte: TaxReturnEntry;
  jaaropgave: { statement: AnnualStatementData; account: AccountData };
};

export type UnmatchedJaaropgave = {
  statement: AnnualStatementData;
  account: AccountData;
};

export type MatchResult = {
  matched: MatchedPair[];
  onlyInAangifte: TaxReturnEntry[];
  onlyInJaaropgave: UnmatchedJaaropgave[];
};

/** Box 1 fields calculated by the Belastingdienst — no jaaropgave is ever issued */
const CALCULATED_FIELDS = ["Eigenwoningforfait"];

type SecondaryMatcher = {
  fieldContains: string;
  getJaaropgaveAmount: (acct: AccountData) => number | null;
};

const wageAmount = (acct: AccountData): number | null =>
  acct.amounts["wage"]?.["taxableWage"] ?? acct.amounts["wage"]?.["grossWage"] ?? null;

/** Entries matched by amount when account-number matching doesn't apply */
const SECONDARY_MATCHERS: SecondaryMatcher[] = [
  { fieldContains: "Loon", getJaaropgaveAmount: wageAmount },
  {
    // LLM sometimes extracts the section header instead of the per-employer line
    fieldContains: "inkomsten uit werk",
    getJaaropgaveAmount: wageAmount,
  },
  {
    fieldContains: "arbeidsongeschiktheid",
    getJaaropgaveAmount: (acct) => acct.amounts["other"]?.["premiumPaid"] ?? null,
  },
];

function primaryMatch(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[]
): MatchResult {
  const allAccounts: UnmatchedJaaropgave[] = annualStatements.flatMap((statement) =>
    statement.accounts.map((account) => ({ statement, account }))
  );

  const matchedAccountNumbers = new Set<string>();
  const matched: MatchedPair[] = [];
  const onlyInAangifte: TaxReturnEntry[] = [];

  for (const aangifte of taxReturn.entries) {
    if (aangifte.accountNumber === null) {
      onlyInAangifte.push(aangifte);
      continue;
    }

    const normalizedAangifte = normalize(aangifte.accountNumber);
    const found = allAccounts.find(
      ({ account }) => normalize(account.accountNumber) === normalizedAangifte
    );

    if (found) {
      matched.push({ aangifte, jaaropgave: found });
      matchedAccountNumbers.add(normalize(found.account.accountNumber));
    } else {
      onlyInAangifte.push(aangifte);
    }
  }

  const onlyInJaaropgave = allAccounts.filter(
    ({ account }) => !matchedAccountNumbers.has(normalize(account.accountNumber))
  );

  return { matched, onlyInAangifte, onlyInJaaropgave };
}

function secondaryMatch(
  matched: MatchedPair[],
  onlyInAangifte: TaxReturnEntry[],
  onlyInJaaropgave: UnmatchedJaaropgave[]
): MatchResult {
  const normalizeField = (s: string) => s.replace(/-/g, "").toLowerCase();

  const remainingAangifte = onlyInAangifte.filter(
    (e) => !CALCULATED_FIELDS.some((f) => normalizeField(e.field).includes(normalizeField(f)))
  );

  const newMatched = [...matched];
  let remainingJaaropgave = [...onlyInJaaropgave];
  const stillUnmatched: TaxReturnEntry[] = [];

  for (const entry of remainingAangifte) {
    const matcher = SECONDARY_MATCHERS.find((m) =>
      normalizeField(entry.field).includes(normalizeField(m.fieldContains))
    );
    if (!matcher) { stillUnmatched.push(entry); continue; }

    const jaaropgaveIdx = remainingJaaropgave.findIndex((j) => {
      const jAmount = matcher.getJaaropgaveAmount(j.account);
      return jAmount !== null && Math.abs(Math.abs(entry.amount) - jAmount) <= 1;
    });

    if (jaaropgaveIdx === -1) { stillUnmatched.push(entry); continue; }

    newMatched.push({ aangifte: entry, jaaropgave: remainingJaaropgave[jaaropgaveIdx] });
    remainingJaaropgave = remainingJaaropgave.filter((_, i) => i !== jaaropgaveIdx);
  }

  return { matched: newMatched, onlyInAangifte: stillUnmatched, onlyInJaaropgave: remainingJaaropgave };
}

/**
 * Full JS-side matching step between extractie and analyse.
 * Pass 1: primary match by normalised rekeningnummer.
 * Pass 2: secondary amount-match for entries without a rekeningnummer (wage income,
 * AO insurance premiums) and removal of calculated fields that never have a jaaropgave.
 */
export function koppeling(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[]
): MatchResult {
  const initial = primaryMatch(taxReturn, annualStatements);
  return secondaryMatch(initial.matched, initial.onlyInAangifte, initial.onlyInJaaropgave);
}
