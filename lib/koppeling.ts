import { matchEntries } from "./account-matcher";
import { applyExceptions } from "./aangifte-exceptions";
import type { AnnualStatementData, TaxReturnData } from "./types";

export type { MatchedPair, MatchResult, UnmatchedJaaropgave } from "./account-matcher";

/**
 * Full JS-side matching step between extractie and analyse.
 * Combines primary account-number matching with secondary amount-based matching
 * for entries without an account number (e.g. wage income, AO insurance premiums).
 */
export function koppeling(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[]
) {
  const initial = matchEntries(taxReturn, annualStatements);
  return applyExceptions(initial.matched, initial.onlyInAangifte, initial.onlyInJaaropgave);
}
