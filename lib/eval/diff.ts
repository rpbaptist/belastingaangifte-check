import type {
  PropertyAmount,
  PropertyStatementData,
  TaxReturnData,
  TaxReturnEntry,
} from "@/lib/types";
import { normalize } from "@/lib/account-normalizer";

// Perception eval: score an extracted aangifte against a known-correct fixture (ADR 0009).
// The point is to detect whether a prompt change made reading better or worse, so the
// comparison must ignore differences that are not misreads (account-number spacing, field
// label casing) while surfacing the ones that are (wrong amount, wrong account, dropped or
// hallucinated rows).

export type MismatchField = "box" | "field" | "account" | "amount";

export interface EntryMismatch {
  expected: TaxReturnEntry;
  actual: TaxReturnEntry;
  differing: MismatchField[];
}

export interface TaxReturnDiff {
  taxYear: { expected: number; actual: number; match: boolean };
  /** Rows extracted exactly right, once normalisation is allowed for. */
  correct: TaxReturnEntry[];
  /** Rows matched to a fixture row but with at least one field misread. */
  mismatched: EntryMismatch[];
  /** Fixture rows with no counterpart in the extraction (dropped / truncated). */
  missing: TaxReturnEntry[];
  /** Extracted rows with no counterpart in the fixture (hallucinated / split). */
  unexpected: TaxReturnEntry[];
}

// Account numbers are compared through the same normalisation the analyzer matches on
// (lib/account-normalizer), so a wrapped IBAN rejoined with spaces is not a misread.
const normAccount = (account: string | null): string => (account ? normalize(account) : "");

// Field labels are free text the model copies off the page; casing and internal whitespace
// carry no meaning, so they are normalised away before comparison.
const normField = (field: string): string => field.trim().replace(/\s+/g, " ").toLowerCase();

function differingFields(expected: TaxReturnEntry, actual: TaxReturnEntry): MismatchField[] {
  const differing: MismatchField[] = [];
  if (expected.box !== actual.box) differing.push("box");
  if (normField(expected.field) !== normField(actual.field)) differing.push("field");
  if (normAccount(expected.accountNumber) !== normAccount(actual.accountNumber))
    differing.push("account");
  if (expected.amount !== actual.amount) differing.push("amount");
  return differing;
}

// Short-circuits on the first difference (used in the hot pass-1 findIndex loop); the fuller
// differingFields is only computed once a pair is confirmed as a mismatch, for the report.
const isExact = (expected: TaxReturnEntry, actual: TaxReturnEntry): boolean =>
  expected.box === actual.box &&
  expected.amount === actual.amount &&
  normField(expected.field) === normField(actual.field) &&
  normAccount(expected.accountNumber) === normAccount(actual.accountNumber);

// Find the best still-unused actual row for a fixture row. Account number is the strongest
// key (unique per row), so it wins; failing that, box+field pairs the row and the closest
// amount disambiguates rows that share a label (two employers, several savings accounts).
function findMatch(target: TaxReturnEntry, actual: TaxReturnEntry[], used: boolean[]): number {
  const targetAccount = normAccount(target.accountNumber);
  if (targetAccount) {
    const byAccount = actual.findIndex(
      (a, i) => !used[i] && normAccount(a.accountNumber) === targetAccount
    );
    if (byAccount >= 0) return byAccount;
  }

  let best = -1;
  let bestDelta = Infinity;
  actual.forEach((a, i) => {
    if (used[i]) return;
    if (a.box !== target.box || normField(a.field) !== normField(target.field)) return;
    const delta = Math.abs(a.amount - target.amount);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  });
  return best;
}

export function diffTaxReturn(expected: TaxReturnData, actual: TaxReturnData): TaxReturnDiff {
  const actualEntries = actual.entries;
  const used = new Array(actualEntries.length).fill(false);

  const correct: TaxReturnEntry[] = [];
  const mismatched: EntryMismatch[] = [];
  const missing: TaxReturnEntry[] = [];
  const unresolved: TaxReturnEntry[] = [];

  // Pass 1: claim exact matches first, so shared-label rows bind to their own twin
  // rather than being paired by the looser box+field rule below.
  for (const expectedEntry of expected.entries) {
    const idx = actualEntries.findIndex((a, i) => !used[i] && isExact(expectedEntry, a));
    if (idx >= 0) {
      used[idx] = true;
      correct.push(expectedEntry);
    } else {
      unresolved.push(expectedEntry);
    }
  }

  // Pass 2: pair whatever is left by strongest available identity and record the misreads.
  for (const expectedEntry of unresolved) {
    const idx = findMatch(expectedEntry, actualEntries, used);
    if (idx >= 0) {
      used[idx] = true;
      mismatched.push({
        expected: expectedEntry,
        actual: actualEntries[idx],
        differing: differingFields(expectedEntry, actualEntries[idx]),
      });
    } else {
      missing.push(expectedEntry);
    }
  }

  const unexpected = actualEntries.filter((_, i) => !used[i]);

  return {
    taxYear: {
      expected: expected.taxYear,
      actual: actual.taxYear,
      match: expected.taxYear === actual.taxYear,
    },
    correct,
    mismatched,
    missing,
    unexpected,
  };
}

export function isPass(diff: TaxReturnDiff): boolean {
  return (
    diff.taxYear.match &&
    diff.mismatched.length === 0 &&
    diff.missing.length === 0 &&
    diff.unexpected.length === 0
  );
}

function describeEntry(entry: TaxReturnEntry): string {
  const account = entry.accountNumber ? ` [${entry.accountNumber}]` : "";
  return `box ${entry.box} "${entry.field}"${account} = ${entry.amount}`;
}

// Shared by formatDiffReport and formatPropertyStatementDiffReport: the two diff shapes
// (aangifte entries, property bewijsstuk amounts) render identically once reduced to
// correct/mismatched/missing/unexpected counts plus a per-item describe function — only the
// noun, header lines (tax year, and for property statements also document kind) and describe
// function differ.
function formatDiffLines<T, M extends { expected: T; actual: T; differing: readonly string[] }>(
  name: string,
  passed: boolean,
  correctCount: number,
  noun: string,
  mismatched: M[],
  missing: T[],
  unexpected: T[],
  headerLines: string[],
  describe: (item: T) => string
): string {
  const total = correctCount + mismatched.length + missing.length;
  const lines: string[] = [];
  lines.push(`${name}: ${passed ? "PASS" : "FAIL"}`);
  lines.push(
    `  ${correctCount}/${total} ${noun} correct, ` +
      `${mismatched.length} misread, ${missing.length} missing, ` +
      `${unexpected.length} unexpected`
  );
  lines.push(...headerLines);

  for (const m of mismatched) {
    lines.push(`  MISREAD (${m.differing.join(", ")}):`);
    lines.push(`    expected: ${describe(m.expected)}`);
    lines.push(`    actual:   ${describe(m.actual)}`);
  }
  for (const e of missing) {
    lines.push(`  MISSING:  ${describe(e)}`);
  }
  for (const e of unexpected) {
    lines.push(`  UNEXPECTED: ${describe(e)}`);
  }

  return lines.join("\n");
}

// Human-readable per-field report for the runner. Kept here (not in the script) so the
// exact wording a reviewer scans is covered by a test.
export function formatDiffReport(name: string, diff: TaxReturnDiff): string {
  const headerLines = diff.taxYear.match
    ? []
    : [`  tax year: expected ${diff.taxYear.expected}, got ${diff.taxYear.actual}`];
  return formatDiffLines(
    name,
    isPass(diff),
    diff.correct.length,
    "rows",
    diff.mismatched,
    diff.missing,
    diff.unexpected,
    headerLines,
    describeEntry
  );
}

// ─── Property bewijsstukken (notarisafrekening, WOZ-beschikking, makelaarsnota) ────────────
//
// Score an extracted property bewijsstuk against a known-correct fixture, mirroring
// diffTaxReturn above (ADR 0010 anticipated "a second diff shape" for extending the harness
// beyond the aangifte). These documents carry no rekeningnummer, so `kind` — the closed
// amount-kind vocabulary from the ADR 0002 amendment — is the matching identity instead of an
// account number; an amount with no recognised kind falls back to its raw label.

export type PropertyMismatchField = "kind" | "label" | "amount";

export interface PropertyAmountMismatch {
  expected: PropertyAmount;
  actual: PropertyAmount;
  differing: PropertyMismatchField[];
}

export interface PropertyStatementDiff {
  documentKind: { expected: string; actual: string; match: boolean };
  taxYear: { expected: number; actual: number; match: boolean };
  institution: { expected: string; actual: string; match: boolean };
  correct: PropertyAmount[];
  mismatched: PropertyAmountMismatch[];
  missing: PropertyAmount[];
  unexpected: PropertyAmount[];
}

const normLabel = (label: string): string => label.trim().replace(/\s+/g, " ").toLowerCase();

function differingPropertyFields(
  expected: PropertyAmount,
  actual: PropertyAmount
): PropertyMismatchField[] {
  const differing: PropertyMismatchField[] = [];
  if (expected.kind !== actual.kind) differing.push("kind");
  if (normLabel(expected.label) !== normLabel(actual.label)) differing.push("label");
  if (expected.amount !== actual.amount) differing.push("amount");
  return differing;
}

const isExactPropertyAmount = (expected: PropertyAmount, actual: PropertyAmount): boolean =>
  expected.kind === actual.kind &&
  expected.amount === actual.amount &&
  normLabel(expected.label) === normLabel(actual.label);

// A recognised kind is the strongest identity (the whole point of the closed vocabulary);
// two null-kind amounts can only be paired by their raw label.
function findPropertyMatch(
  target: PropertyAmount,
  actual: PropertyAmount[],
  used: boolean[]
): number {
  if (target.kind) {
    const byKind = actual.findIndex((a, i) => !used[i] && a.kind === target.kind);
    if (byKind >= 0) return byKind;
  }
  return actual.findIndex(
    (a, i) => !used[i] && a.kind === null && normLabel(a.label) === normLabel(target.label)
  );
}

export function diffPropertyStatement(
  expected: PropertyStatementData,
  actual: PropertyStatementData
): PropertyStatementDiff {
  const actualAmounts = actual.amounts;
  const used = new Array(actualAmounts.length).fill(false);

  const correct: PropertyAmount[] = [];
  const mismatched: PropertyAmountMismatch[] = [];
  const missing: PropertyAmount[] = [];
  const unresolved: PropertyAmount[] = [];

  for (const expectedAmount of expected.amounts) {
    const idx = actualAmounts.findIndex(
      (a, i) => !used[i] && isExactPropertyAmount(expectedAmount, a)
    );
    if (idx >= 0) {
      used[idx] = true;
      correct.push(expectedAmount);
    } else {
      unresolved.push(expectedAmount);
    }
  }

  for (const expectedAmount of unresolved) {
    const idx = findPropertyMatch(expectedAmount, actualAmounts, used);
    if (idx >= 0) {
      used[idx] = true;
      mismatched.push({
        expected: expectedAmount,
        actual: actualAmounts[idx],
        differing: differingPropertyFields(expectedAmount, actualAmounts[idx]),
      });
    } else {
      missing.push(expectedAmount);
    }
  }

  const unexpected = actualAmounts.filter((_, i) => !used[i]);

  return {
    documentKind: {
      expected: expected.documentKind,
      actual: actual.documentKind,
      match: expected.documentKind === actual.documentKind,
    },
    taxYear: {
      expected: expected.taxYear,
      actual: actual.taxYear,
      match: expected.taxYear === actual.taxYear,
    },
    institution: {
      expected: expected.institution,
      actual: actual.institution,
      match: expected.institution === actual.institution,
    },
    correct,
    mismatched,
    missing,
    unexpected,
  };
}

export function isPropertyStatementPass(diff: PropertyStatementDiff): boolean {
  return (
    diff.documentKind.match &&
    diff.taxYear.match &&
    diff.mismatched.length === 0 &&
    diff.missing.length === 0 &&
    diff.unexpected.length === 0
  );
}

function describePropertyAmount(amount: PropertyAmount): string {
  return `${amount.kind ?? "(no kind)"} "${amount.label}" = ${amount.amount}`;
}

export function formatPropertyStatementDiffReport(
  name: string,
  diff: PropertyStatementDiff
): string {
  const headerLines: string[] = [];
  if (!diff.documentKind.match) {
    headerLines.push(
      `  document kind: expected ${diff.documentKind.expected}, got ${diff.documentKind.actual}`
    );
  }
  if (!diff.taxYear.match) {
    headerLines.push(`  tax year: expected ${diff.taxYear.expected}, got ${diff.taxYear.actual}`);
  }

  return formatDiffLines(
    name,
    isPropertyStatementPass(diff),
    diff.correct.length,
    "amounts",
    diff.mismatched,
    diff.missing,
    diff.unexpected,
    headerLines,
    describePropertyAmount
  );
}
