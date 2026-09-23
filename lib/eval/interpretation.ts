import type { DeterministicReport } from "@/lib/report";
import type {
  Finding,
  MissingStatementItem,
  NotFilledInItem,
  PropertyAmountKind,
  PropertyDocumentKind,
} from "@/lib/types";

// The shape an Interpretation fixture records in its expected.json (#104): every row per
// report category with its amounts and an explicit count, findings as kind and count, and
// rule points without their text. Titles, details and explanations are language-dependent,
// so a translation edit must not fail the replay; a lost or moved row must.

// A row the current pipeline gets wrong, recorded as-is so the fixture is not edited to hide
// it. The marker changes no assertion — the replay compares the row like any other.
type KnownWrong = { issue: number; note: string };
type Marked<T> = T & { knownWrong?: KnownWrong };

type Category<T> = { count: number; rows: Marked<T>[] };

type MatchedRow = {
  field: string;
  accountNumber: string;
  institution: string;
  amountTaxReturn: number;
  amountStatement: number;
};

type PropertyStatementRow = {
  documentKind: PropertyDocumentKind;
  institution: string;
  amounts: { kind: PropertyAmountKind | null; amount: number }[];
};

export type ReportSummary = {
  taxYear: number;
  covered: Category<MatchedRow>;
  amountMismatches: Category<MatchedRow>;
  missingStatement: Category<MissingStatementItem>;
  notFilledIn: Category<NotFilledInItem>;
  propertyStatements: Category<PropertyStatementRow>;
  findings: { count: number; byKind: Partial<Record<Finding["kind"], number>> };
  rulePoints: { count: number; accountNumbers: string[] };
};

// Sorted by content, so an order-only change in the pipeline (#180) does not fail the replay.
function category<T>(rows: Marked<T>[]): Category<T> {
  const sorted = [...rows].sort((a, b) => {
    const ka = JSON.stringify(a);
    const kb = JSON.stringify(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return { count: rows.length, rows: sorted };
}

export function summarizeReport(report: DeterministicReport): ReportSummary {
  const byKind: ReportSummary["findings"]["byKind"] = {};
  for (const { kind } of report.findings) byKind[kind] = (byKind[kind] ?? 0) + 1;

  return {
    taxYear: report.taxYear,
    covered: category(
      report.covered.map((c) => ({
        field: c.field,
        accountNumber: c.accountNumber,
        institution: c.institution,
        amountTaxReturn: c.amountTaxReturn,
        amountStatement: c.amountStatement,
      }))
    ),
    amountMismatches: category(
      report.amountMismatches.map((m) => ({
        field: m.aangifte.field,
        accountNumber: m.aangifte.accountNumber ?? m.jaaropgave.account.accountNumber,
        institution: m.jaaropgave.statement.institution,
        amountTaxReturn: m.aangifte.amount,
        amountStatement: m.amountStatement,
      }))
    ),
    missingStatement: category(
      report.missingStatement.map((m) => ({
        field: m.field,
        accountNumber: m.accountNumber,
        amount: m.amount,
        box: m.box,
      }))
    ),
    notFilledIn: category(
      report.notFilledIn.map((n) => ({
        accountNumber: n.accountNumber,
        institution: n.institution,
        description: n.description,
        amount: n.amount,
      }))
    ),
    propertyStatements: category(
      report.propertyStatements.map((p) => ({
        documentKind: p.documentKind,
        institution: p.institution,
        amounts: p.amounts.map((a) => ({ kind: a.kind, amount: a.amount })),
      }))
    ),
    findings: { count: report.findings.length, byKind },
    rulePoints: {
      count: report.rulePoints.length,
      accountNumbers: report.rulePoints
        .flatMap((p) => (p.accountNumber ? [p.accountNumber] : []))
        .sort(),
    },
  };
}

function unmarked<T>({ rows, count }: Category<T>): Category<T> {
  return { count, rows: rows.map(({ knownWrong: _, ...row }) => row as Marked<T>) };
}

export function withoutKnownWrong(summary: ReportSummary): ReportSummary {
  return {
    ...summary,
    covered: unmarked(summary.covered),
    amountMismatches: unmarked(summary.amountMismatches),
    missingStatement: unmarked(summary.missingStatement),
    notFilledIn: unmarked(summary.notFilledIn),
    propertyStatements: unmarked(summary.propertyStatements),
  };
}
