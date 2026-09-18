import { categorize, type AmountMismatch } from "./categorizer";
import { reconcile } from "./reconciler";
import { runRuleChecks } from "./rule-checks";
import { duplicateRowsFinding, unresolvedAmountFinding, validateStatements } from "./validation";
import { type Language } from "./translations";
import type {
  AnnualStatementData,
  AttentionPoint,
  CoveredItem,
  Finding,
  MissingStatementItem,
  NotFilledInItem,
  PropertyStatementData,
  TaxReturnData,
  UnrecognizedDocument,
} from "./types";

export type DeterministicReport = {
  taxYear: number;
  covered: CoveredItem[];
  missingStatement: MissingStatementItem[];
  notFilledIn: NotFilledInItem[];
  propertyStatements: PropertyStatementData[];
  amountMismatches: AmountMismatch[];
  findings: Finding[];
  rulePoints: AttentionPoint[];
};

/**
 * Deterministic report seam: Reconciliation, Categorization, rule checks and the
 * Validation layer behind one pure call. No network calls, no environment reads, no LLM —
 * Analysis stays in `analyzeDocuments`. Deterministic for a given `language`; `rulePoints`
 * and `findings` titles vary across languages.
 *
 * `findings` (what the tool could not read) are kept separate from `rulePoints`/aandachtspunten
 * (statements about the filer's tax position) — see ADR 0008.
 *
 * `propertyStatements` (notarisafrekening, WOZ-beschikking, makelaarsnota) never reach
 * `reconcile`/`categorize` — per the ADR 0002 amendment they carry no rekeningnummer and are
 * never matched against the aangifte, only listed and validated.
 */
export function buildReport(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  propertyStatements: PropertyStatementData[],
  unrecognizedDocuments: UnrecognizedDocument[],
  language: Language
): DeterministicReport {
  const matchResult = reconcile(taxReturn, annualStatements);
  const {
    covered,
    missingStatement,
    notFilledIn,
    amountMismatches,
    unresolved,
    duplicateRowsCollapsed,
  } = categorize(matchResult);
  const rulePoints = runRuleChecks(annualStatements, taxReturn.taxYear, language);

  // The Validation layer owns every Finding's shape and wording. buildReport only routes its
  // sources: unresolvable matched amounts and collapsed duplicates (surfaced by the
  // categorizer) and the statement-level checks (validateStatements), which also cover
  // property bewijsstukken and documents of no recognised kind.
  const duplicateFinding = duplicateRowsFinding(duplicateRowsCollapsed, language);
  const findings: Finding[] = [
    ...unresolved.map((pair) => unresolvedAmountFinding(pair, language)),
    ...validateStatements(
      taxReturn,
      annualStatements,
      propertyStatements,
      unrecognizedDocuments,
      language
    ),
    ...(duplicateFinding ? [duplicateFinding] : []),
  ];

  return {
    taxYear: taxReturn.taxYear,
    covered,
    missingStatement,
    notFilledIn,
    propertyStatements,
    amountMismatches,
    findings,
    rulePoints,
  };
}
