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

export function matchEntries(
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
