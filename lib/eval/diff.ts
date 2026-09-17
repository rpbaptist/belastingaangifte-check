import type { TaxReturnData, TaxReturnEntry } from "@/lib/types";
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

// Human-readable per-field report for the runner. Kept here (not in the script) so the
// exact wording a reviewer scans is covered by a test.
export function formatDiffReport(name: string, diff: TaxReturnDiff): string {
  const total = diff.correct.length + diff.mismatched.length + diff.missing.length;
  const lines: string[] = [];
  const status = isPass(diff) ? "PASS" : "FAIL";
  lines.push(`${name}: ${status}`);
  lines.push(
    `  ${diff.correct.length}/${total} rows correct, ` +
      `${diff.mismatched.length} misread, ${diff.missing.length} missing, ` +
      `${diff.unexpected.length} unexpected`
  );

  if (!diff.taxYear.match) {
    lines.push(`  tax year: expected ${diff.taxYear.expected}, got ${diff.taxYear.actual}`);
  }

  for (const m of diff.mismatched) {
    lines.push(`  MISREAD (${m.differing.join(", ")}):`);
    lines.push(`    expected: ${describeEntry(m.expected)}`);
    lines.push(`    actual:   ${describeEntry(m.actual)}`);
  }
  for (const e of diff.missing) {
    lines.push(`  MISSING:  ${describeEntry(e)}`);
  }
  for (const e of diff.unexpected) {
    lines.push(`  UNEXPECTED: ${describeEntry(e)}`);
  }

  return lines.join("\n");
}
