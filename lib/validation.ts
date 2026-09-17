import type {
  AccountData,
  AnnualStatementData,
  Finding,
  PropertyStatementData,
  TaxReturnData,
  UnrecognizedDocument,
} from "./types";
import type { MatchedPair } from "./reconciler";
import type { DuplicateRowCollapsed } from "./categorizer";
import { formatEuro } from "./format";
import {
  formatDuplicateRowsCollapsed,
  formatSignContradiction,
  formatTaxYearMismatch,
  formatUnknownAmountKind,
  formatUnrecognizedDocument,
  formatUnresolvedAmount,
  translate,
  type Language,
} from "./translations";

// The amount categories the pipeline (reconciler, categorizer, field-mapping, rule checks)
// actually reads. AccountAmounts allows any string key, so extraction can emit a category
// nothing downstream understands; those are reported rather than silently dropped.
const KNOWN_AMOUNT_CATEGORIES: ReadonlySet<string> = new Set([
  "bank",
  "broker",
  "mortgage",
  "wage",
  "other",
]);

// Most jaaropgave amounts are magnitudes (taxes, premiums, interest, dividends, wages); the
// aangifte side applies any negation (deductions), so a negative one is a misread. Balances
// are the exception — a bank or brokerage account can legitimately be negative (an overdraft,
// a margin debit, a Box 3 debt) — so a field named "balance" is never sign-judged.
const SIGN_EXEMPT_FIELDS: ReadonlySet<string> = new Set(["balance"]);

// Every finding shares this {kind, title, detail} core; builders below add whatever
// fields their kind actually carries (institution, accountNumber, field, proposedCorrection).
function makeFinding(
  kind: Finding["kind"],
  titleKey: Parameters<typeof translate>[0],
  detail: string,
  language: Language,
  extra: Omit<Finding, "kind" | "title" | "detail"> = {}
): Finding {
  return { kind, title: translate(titleKey, language), detail, ...extra };
}

function taxYearFinding(
  statement: { taxYear: number; institution: string },
  taxReturnYear: number,
  language: Language
): Finding | null {
  if (statement.taxYear === taxReturnYear) return null;
  return makeFinding(
    "taxYearMismatch",
    "taxYearMismatchTitle",
    formatTaxYearMismatch(statement.taxYear, taxReturnYear, statement.institution, language),
    language,
    { institution: statement.institution }
  );
}

// A bewijsstuk the extractor could not place in any recognised kind. Reported so an
// unclassifiable document says so rather than silently having no effect (#109).
function unrecognizedDocumentFinding(doc: UnrecognizedDocument, language: Language): Finding {
  return makeFinding(
    "unrecognizedDocument",
    "unrecognizedDocumentTitle",
    formatUnrecognizedDocument(doc.institution, language),
    language,
    doc.institution ? { institution: doc.institution } : {}
  );
}

// A property bewijsstuk amount outside the closed kind set (saleProceeds, notaryCosts,
// brokerCommission, loanRepayment, wozValue). Its raw label is reported rather than the
// amount being invented into a new key.
function propertyAmountFindings(statement: PropertyStatementData, language: Language): Finding[] {
  return statement.amounts
    .filter((a) => a.kind === null)
    .map((a) =>
      makeFinding(
        "unknownAmountKind",
        "unknownAmountKindTitle",
        formatUnknownAmountKind(a.label, statement.institution, language),
        language,
        { institution: statement.institution, field: a.label }
      )
    );
}

function unknownKindFinding(
  statement: AnnualStatementData,
  account: AccountData,
  category: string,
  language: Language
): Finding {
  return makeFinding(
    "unknownAmountKind",
    "unknownAmountKindTitle",
    formatUnknownAmountKind(category, statement.institution, language),
    language,
    { institution: statement.institution, accountNumber: account.accountNumber, field: category }
  );
}

function signFinding(
  statement: AnnualStatementData,
  account: AccountData,
  category: string,
  field: string,
  value: number,
  language: Language
): Finding | null {
  if (value >= 0 || SIGN_EXEMPT_FIELDS.has(field)) return null;
  const label = `${category}.${field}`;
  return makeFinding(
    "signContradiction",
    "signContradictionTitle",
    formatSignContradiction(label, formatEuro(value), statement.institution, language),
    language,
    {
      institution: statement.institution,
      accountNumber: account.accountNumber,
      field: label,
      proposedCorrection: { before: value, after: -value },
    }
  );
}

// A category the pipeline reads is checked amount by amount for a contradictory sign; an
// unrecognised category that actually carries an amount is reported once as a whole and its
// amounts are not sign-judged (we can't say what sign a kind we don't understand should carry).
function accountFindings(
  statement: AnnualStatementData,
  account: AccountData,
  language: Language
): Finding[] {
  const findings: Finding[] = [];
  for (const [category, fields] of Object.entries(account.amounts)) {
    if (!fields) continue;
    const hasAmount = Object.values(fields).some((v) => v != null);
    if (!hasAmount) continue;

    if (!KNOWN_AMOUNT_CATEGORIES.has(category)) {
      findings.push(unknownKindFinding(statement, account, category, language));
      continue;
    }
    for (const [field, value] of Object.entries(fields)) {
      if (value == null) continue;
      const finding = signFinding(statement, account, category, field, value, language);
      if (finding) findings.push(finding);
    }
  }
  return findings;
}

// A matched pair whose bewijsstuk amount could not be resolved. Its own outcome — never
// covered — and the aangifte figure is deliberately not echoed back as a confirmed match.
export function unresolvedAmountFinding(pair: MatchedPair, language: Language): Finding {
  return makeFinding(
    "unresolvedAmount",
    "unresolvedAmountTitle",
    formatUnresolvedAmount(pair.aangifte.field, pair.jaaropgave.statement.institution, language),
    language,
    {
      institution: pair.jaaropgave.statement.institution,
      accountNumber: pair.aangifte.accountNumber ?? pair.jaaropgave.account.accountNumber,
      field: pair.aangifte.field,
    }
  );
}

// Collapsed exact-duplicate rows are a reading artifact, not a position — one finding
// summarising how many were folded away, so a genuine duplicate stays visible.
export function duplicateRowsFinding(
  collapsed: DuplicateRowCollapsed[],
  language: Language
): Finding | null {
  if (collapsed.length === 0) return null;
  return makeFinding(
    "duplicateRow",
    "duplicateRowsCollapsedTitle",
    formatDuplicateRowsCollapsed(collapsed.length, language),
    language
  );
}

/**
 * Deterministic Validation layer. Reads the extracted aangifte and bewijsstukken and
 * reports what it could not read — it never repairs (ADR 0008). Pure and side-effect free;
 * a rule may attach a proposed correction as data on its finding, but applying it is a
 * separate, named transform the caller invokes.
 *
 * Covers the statement-level checks: tax year mismatch, sign contradiction, amounts of a kind
 * nothing downstream understands (jaaropgave categories and property-bewijsstuk kinds alike),
 * and documents that matched none of the recognised kinds at all. Reading failures that only
 * surface once aangifte and bewijsstuk are matched (an unresolvable amount, a collapsed
 * duplicate) are produced by the categorizer and folded into the same findings channel by
 * `buildReport`.
 */
export function validateStatements(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  propertyStatements: PropertyStatementData[],
  unrecognizedDocuments: UnrecognizedDocument[],
  language: Language
): Finding[] {
  const findings: Finding[] = [];
  for (const statement of annualStatements) {
    const yearFinding = taxYearFinding(statement, taxReturn.taxYear, language);
    if (yearFinding) findings.push(yearFinding);
    for (const account of statement.accounts) {
      findings.push(...accountFindings(statement, account, language));
    }
  }
  for (const statement of propertyStatements) {
    const yearFinding = taxYearFinding(statement, taxReturn.taxYear, language);
    if (yearFinding) findings.push(yearFinding);
    findings.push(...propertyAmountFindings(statement, language));
  }
  for (const doc of unrecognizedDocuments) {
    findings.push(unrecognizedDocumentFinding(doc, language));
  }
  return findings;
}
