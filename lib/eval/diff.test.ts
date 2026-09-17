import { describe, it, expect } from "vitest";
import type { TaxReturnData, TaxReturnEntry } from "@/lib/types";
import { diffTaxReturn, isPass, formatDiffReport } from "./diff";

// The eval harness exists so a prompt change can be scored, not eyeballed (ADR 0009).
// A diff that is too strict flags noise as regressions; one that is too loose hides them.
// These tests pin the matching rules the score depends on.

const entry = (over: Partial<TaxReturnEntry>): TaxReturnEntry => ({
  box: "3",
  field: "Saldo",
  accountNumber: null,
  amount: 0,
  ...over,
});

const doc = (entries: TaxReturnEntry[], taxYear = 2023): TaxReturnData => ({
  taxYear,
  entries,
});

describe("diffTaxReturn", () => {
  it("counts an identical extraction as fully correct", () => {
    const expected = doc([
      entry({ box: "1", field: "Loon in Nederland", amount: 41200 }),
      entry({
        box: "3",
        field: "ING Betaalrekening",
        accountNumber: "NL22INGB0673345785",
        amount: 5140,
      }),
    ]);
    const diff = diffTaxReturn(expected, structuredClone(expected));
    expect(diff.correct).toHaveLength(2);
    expect(diff.mismatched).toHaveLength(0);
    expect(diff.missing).toHaveLength(0);
    expect(diff.unexpected).toHaveLength(0);
    expect(isPass(diff)).toBe(true);
  });

  it("treats a differently formatted account number as correct", () => {
    // The prompt reconstructs a wrapped IBAN with spaces ("NL22 INGB 0673 3457 85").
    // Matching normalises account numbers so spacing is never scored as a misread.
    const expected = doc([
      entry({ field: "ING Betaalrekening", accountNumber: "NL22INGB0673345785", amount: 5140 }),
    ]);
    const actual = doc([
      entry({ field: "ING Betaalrekening", accountNumber: "NL22 INGB 0673 3457 85", amount: 5140 }),
    ]);
    const diff = diffTaxReturn(expected, actual);
    expect(diff.correct).toHaveLength(1);
    expect(isPass(diff)).toBe(true);
  });

  it("treats a field label that differs only in case and spacing as correct", () => {
    const expected = doc([entry({ field: "Loon in Nederland", box: "1", amount: 100 })]);
    const actual = doc([entry({ field: "  loon in  nederland ", box: "1", amount: 100 })]);
    expect(isPass(diffTaxReturn(expected, actual))).toBe(true);
  });

  it("reports the amount as the differing field when only the amount is misread", () => {
    // The classic wrapped-identifier failure: right row, wrong number pulled off the
    // continuation line.
    const expected = doc([
      entry({ field: "ING Betaalrekening", accountNumber: "NL22INGB0673345785", amount: 5140 }),
    ]);
    const actual = doc([
      entry({ field: "ING Betaalrekening", accountNumber: "NL22INGB0673345785", amount: 3457 }),
    ]);
    const diff = diffTaxReturn(expected, actual);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toEqual(["amount"]);
    expect(isPass(diff)).toBe(false);
  });

  it("pairs a row by field when its account is misread, flagging account and amount", () => {
    const expected = doc([
      entry({ field: "ING Betaalrekening", accountNumber: "NL22INGB0673345785", amount: 5140 }),
    ]);
    const actual = doc([
      // Continuation line dropped: truncated IBAN and the wrong amount grabbed.
      entry({ field: "ING Betaalrekening", accountNumber: "NL22INGB0673", amount: 85 }),
    ]);
    const diff = diffTaxReturn(expected, actual);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toEqual(["account", "amount"]);
  });

  it("keeps two rows that share a label as two distinct matches", () => {
    // Two employers under one "Loon in Nederland" label must never be merged.
    const expected = doc([
      entry({ box: "1", field: "Loon in Nederland", amount: 41200 }),
      entry({ box: "1", field: "Loon in Nederland", amount: 9800 }),
    ]);
    const diff = diffTaxReturn(expected, structuredClone(expected));
    expect(diff.correct).toHaveLength(2);
    expect(isPass(diff)).toBe(true);
  });

  it("flags a merged shared-label row as one missing and one amount mismatch", () => {
    const expected = doc([
      entry({ box: "1", field: "Loon in Nederland", amount: 41200 }),
      entry({ box: "1", field: "Loon in Nederland", amount: 9800 }),
    ]);
    // Model summed both employers into a single row.
    const actual = doc([entry({ box: "1", field: "Loon in Nederland", amount: 50750 })]);
    const diff = diffTaxReturn(expected, actual);
    expect(diff.missing).toHaveLength(1);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toEqual(["amount"]);
  });

  it("reports a row that was never extracted as missing", () => {
    const expected = doc([
      entry({ field: "A", accountNumber: "NL22INGB0673345785", amount: 1 }),
      entry({ field: "B", accountNumber: "NL89ABNA0123456789", amount: 2 }),
    ]);
    const actual = doc([entry({ field: "A", accountNumber: "NL22INGB0673345785", amount: 1 })]);
    const diff = diffTaxReturn(expected, actual);
    expect(diff.missing.map((e) => e.field)).toEqual(["B"]);
    expect(diff.unexpected).toHaveLength(0);
    expect(isPass(diff)).toBe(false);
  });

  it("reports a hallucinated row as unexpected", () => {
    const expected = doc([entry({ field: "A", accountNumber: "NL22INGB0673345785", amount: 1 })]);
    const actual = doc([
      entry({ field: "A", accountNumber: "NL22INGB0673345785", amount: 1 }),
      entry({ field: "Ghost", accountNumber: "NL89ABNA0123456789", amount: 9 }),
    ]);
    const diff = diffTaxReturn(expected, actual);
    expect(diff.unexpected.map((e) => e.field)).toEqual(["Ghost"]);
    expect(isPass(diff)).toBe(false);
  });

  it("flags a mismatched tax year", () => {
    const diff = diffTaxReturn(doc([], 2023), doc([], 2024));
    expect(diff.taxYear.match).toBe(false);
    expect(isPass(diff)).toBe(false);
  });
});

describe("formatDiffReport", () => {
  it("names each differing field for a mismatch", () => {
    const expected = doc([
      entry({ field: "ING Betaalrekening", accountNumber: "NL22INGB0673345785", amount: 5140 }),
    ]);
    const actual = doc([
      entry({ field: "ING Betaalrekening", accountNumber: "NL22INGB0673345785", amount: 3457 }),
    ]);
    const report = formatDiffReport("aangifte-2023", diffTaxReturn(expected, actual));
    expect(report).toContain("aangifte-2023");
    expect(report).toContain("amount");
    expect(report).toContain("5140");
    expect(report).toContain("3457");
  });

  it("reports a clean pass without listing mismatches", () => {
    const expected = doc([entry({ field: "A", accountNumber: "NL22INGB0673345785", amount: 1 })]);
    const report = formatDiffReport(
      "aangifte-2023",
      diffTaxReturn(expected, structuredClone(expected))
    );
    expect(report).toContain("PASS");
  });
});
