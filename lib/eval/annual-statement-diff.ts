import type { AnnualStatementData, AccountData, AccountAmounts } from "@/lib/types";
import { normalize } from "@/lib/account-normalizer";

// Perception eval: score an extracted jaaropgave against a known-correct fixture (ADR 0009).
// A sibling to lib/eval/diff.ts (TaxReturnData) — the two data shapes don't overlap enough to
// share a diff, but the intent is the same: normalise away differences that are not misreads
// and name the ones that are, per account and per amount field.

export type AccountMismatchField = "accountNumber" | "description" | "amounts";

export interface AmountFieldDiff {
  /** e.g. "bank.balance" */
  path: string;
  expected: number | undefined;
  actual: number | undefined;
}

export interface AccountMismatch {
  expected: AccountData;
  actual: AccountData;
  differing: AccountMismatchField[];
  amountDiffs: AmountFieldDiff[];
}

export interface AnnualStatementDiff {
  institution: { expected: string; actual: string; match: boolean };
  institutionType: { expected: string; actual: string; match: boolean };
  taxYear: { expected: number; actual: number; match: boolean };
  /** Accounts extracted exactly right, once normalisation is allowed for. */
  correct: AccountData[];
  /** Accounts matched to a fixture account but with at least one field misread. */
  mismatched: AccountMismatch[];
  /** Fixture accounts with no counterpart in the extraction (dropped). */
  missing: AccountData[];
  /** Extracted accounts with no counterpart in the fixture (hallucinated / wrongly split). */
  unexpected: AccountData[];
}

// Account numbers go through the same normalisation the analyzer matches on (spacing,
// punctuation, "Nummer"/"Nr" prefixes). A masked identifier (e.g. "******ist") normalises to
// itself — normalisation never invents or removes a mask, so it is scored as a misread only if
// the mask itself is wrong.
const normAccount = (account: string): string => normalize(account);

const normDescription = (description: string): string =>
  description.trim().replace(/\s+/g, " ").toLowerCase();

function diffAmounts(expected: AccountAmounts, actual: AccountAmounts): AmountFieldDiff[] {
  const categories = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const diffs: AmountFieldDiff[] = [];

  for (const category of categories) {
    const expectedCategory = expected[category] ?? {};
    const actualCategory = actual[category] ?? {};
    const keys = new Set([...Object.keys(expectedCategory), ...Object.keys(actualCategory)]);

    for (const key of keys) {
      const expectedValue = expectedCategory[key];
      const actualValue = actualCategory[key];
      if (expectedValue !== actualValue) {
        diffs.push({ path: `${category}.${key}`, expected: expectedValue, actual: actualValue });
      }
    }
  }

  return diffs;
}

function differingFields(expected: AccountData, actual: AccountData): AccountMismatchField[] {
  const differing: AccountMismatchField[] = [];
  if (normAccount(expected.accountNumber) !== normAccount(actual.accountNumber))
    differing.push("accountNumber");
  if (normDescription(expected.description) !== normDescription(actual.description))
    differing.push("description");
  if (diffAmounts(expected.amounts, actual.amounts).length > 0) differing.push("amounts");
  return differing;
}

const isExact = (expected: AccountData, actual: AccountData): boolean =>
  normAccount(expected.accountNumber) === normAccount(actual.accountNumber) &&
  normDescription(expected.description) === normDescription(actual.description) &&
  diffAmounts(expected.amounts, actual.amounts).length === 0;

function totalAmount(amounts: AccountAmounts): number {
  let total = 0;
  for (const category of Object.values(amounts)) {
    if (!category) continue;
    for (const value of Object.values(category)) {
      total += Math.abs(value ?? 0);
    }
  }
  return total;
}

// Find the best still-unused actual account for a fixture account. Account number is the
// strongest key; failing that (e.g. the masked identifier itself was misread), fall back to the
// closest total amount so a wrong-account-number misread is still reported as a mismatch rather
// than as one missing row and one unexpected row.
function findMatch(target: AccountData, actual: AccountData[], used: boolean[]): number {
  const targetAccount = normAccount(target.accountNumber);
  const byAccount = actual.findIndex(
    (a, i) => !used[i] && normAccount(a.accountNumber) === targetAccount
  );
  if (byAccount >= 0) return byAccount;

  let best = -1;
  let bestDelta = Infinity;
  const targetTotal = totalAmount(target.amounts);
  actual.forEach((a, i) => {
    if (used[i]) return;
    const delta = Math.abs(totalAmount(a.amounts) - targetTotal);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  });
  return best;
}

export function diffAnnualStatement(
  expected: AnnualStatementData,
  actual: AnnualStatementData
): AnnualStatementDiff {
  const actualAccounts = actual.accounts;
  const used = new Array(actualAccounts.length).fill(false);

  const correct: AccountData[] = [];
  const mismatched: AccountMismatch[] = [];
  const missing: AccountData[] = [];
  const unresolved: AccountData[] = [];

  // Pass 1: claim exact matches first, so accounts sharing an issuer bind to their own twin
  // rather than being paired by the looser amount-proximity rule below.
  for (const expectedAccount of expected.accounts) {
    const idx = actualAccounts.findIndex((a, i) => !used[i] && isExact(expectedAccount, a));
    if (idx >= 0) {
      used[idx] = true;
      correct.push(expectedAccount);
    } else {
      unresolved.push(expectedAccount);
    }
  }

  // Pass 2: pair whatever is left by strongest available identity and record the misreads.
  for (const expectedAccount of unresolved) {
    const idx = findMatch(expectedAccount, actualAccounts, used);
    if (idx >= 0) {
      used[idx] = true;
      mismatched.push({
        expected: expectedAccount,
        actual: actualAccounts[idx],
        differing: differingFields(expectedAccount, actualAccounts[idx]),
        amountDiffs: diffAmounts(expectedAccount.amounts, actualAccounts[idx].amounts),
      });
    } else {
      missing.push(expectedAccount);
    }
  }

  const unexpected = actualAccounts.filter((_, i) => !used[i]);

  return {
    institution: {
      expected: expected.institution,
      actual: actual.institution,
      match: expected.institution === actual.institution,
    },
    institutionType: {
      expected: expected.institutionType,
      actual: actual.institutionType,
      match: expected.institutionType === actual.institutionType,
    },
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

export function isAnnualStatementPass(diff: AnnualStatementDiff): boolean {
  return (
    diff.institution.match &&
    diff.institutionType.match &&
    diff.taxYear.match &&
    diff.mismatched.length === 0 &&
    diff.missing.length === 0 &&
    diff.unexpected.length === 0
  );
}

function describeAccount(account: AccountData): string {
  return `"${account.description}" [${account.accountNumber}]`;
}

// Human-readable per-field report for the runner. Kept here (not in the script) so the exact
// wording a reviewer scans is covered by a test.
export function formatAnnualStatementDiffReport(name: string, diff: AnnualStatementDiff): string {
  const total = diff.correct.length + diff.mismatched.length + diff.missing.length;
  const lines: string[] = [];
  const status = isAnnualStatementPass(diff) ? "PASS" : "FAIL";
  lines.push(`${name}: ${status}`);
  lines.push(
    `  ${diff.correct.length}/${total} accounts correct, ` +
      `${diff.mismatched.length} misread, ${diff.missing.length} missing, ` +
      `${diff.unexpected.length} unexpected`
  );

  if (!diff.institution.match) {
    lines.push(
      `  institution: expected "${diff.institution.expected}", got "${diff.institution.actual}"`
    );
  }
  if (!diff.institutionType.match) {
    lines.push(
      `  institutionType: expected "${diff.institutionType.expected}", got "${diff.institutionType.actual}"`
    );
  }
  if (!diff.taxYear.match) {
    lines.push(`  tax year: expected ${diff.taxYear.expected}, got ${diff.taxYear.actual}`);
  }

  for (const m of diff.mismatched) {
    lines.push(`  MISREAD (${m.differing.join(", ")}):`);
    lines.push(`    expected: ${describeAccount(m.expected)}`);
    lines.push(`    actual:   ${describeAccount(m.actual)}`);
    for (const d of m.amountDiffs) {
      lines.push(
        `      ${d.path}: expected ${d.expected ?? "(none)"}, got ${d.actual ?? "(none)"}`
      );
    }
  }
  for (const a of diff.missing) {
    lines.push(`  MISSING:  ${describeAccount(a)}`);
  }
  for (const a of diff.unexpected) {
    lines.push(`  UNEXPECTED: ${describeAccount(a)}`);
  }

  return lines.join("\n");
}
