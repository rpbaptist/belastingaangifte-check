import { categorize, type AmountMismatch } from "./categorizer";
import { reconcile } from "./reconciler";
import { runRuleChecks } from "./rule-checks";
import type { Language } from "./translations";
import type {
  AnnualStatementData,
  AttentionPoint,
  CoveredItem,
  MissingStatementItem,
  NotFilledInItem,
  TaxReturnData,
} from "./types";

export type DeterministicReport = {
  taxYear: number;
  covered: CoveredItem[];
  missingStatement: MissingStatementItem[];
  notFilledIn: NotFilledInItem[];
  amountMismatches: AmountMismatch[];
  rulePoints: AttentionPoint[];
};

/**
 * Deterministic report seam: Reconciliation, Categorization and rule checks
 * behind one pure call. No network calls, no environment reads, no LLM —
 * Analysis stays in `analyzeDocuments`. Deterministic for a given `language`;
 * `rulePoints` titles vary across languages.
 */
export function buildReport(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  language: Language
): DeterministicReport {
  const matchResult = reconcile(taxReturn, annualStatements);
  const { covered, missingStatement, notFilledIn, amountMismatches } = categorize(matchResult);
  const rulePoints = runRuleChecks(annualStatements, taxReturn.taxYear, language);

  return {
    taxYear: taxReturn.taxYear,
    covered,
    missingStatement,
    notFilledIn,
    amountMismatches,
    rulePoints,
  };
}
