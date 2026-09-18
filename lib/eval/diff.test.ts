import { describe, it, expect } from "vitest";
import type {
  PropertyAmount,
  PropertyStatementData,
  TaxReturnData,
  TaxReturnEntry,
} from "@/lib/types";
import {
  diffPropertyStatement,
  diffTaxReturn,
  formatDiffReport,
  formatPropertyStatementDiffReport,
  isPass,
  isPropertyStatementPass,
} from "./diff";

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

// diffPropertyStatement scores notarisafrekening/WOZ-beschikking/makelaarsnota extraction —
// the second diff shape ADR 0010 anticipated. Amounts are matched by `kind` (the closed
// vocabulary that replaces rekeningnummer identity for these documents, ADR 0002 amendment),
// falling back to label matching only when kind is null on both sides.

const propertyAmount = (over: Partial<PropertyAmount>): PropertyAmount => ({
  kind: "saleProceeds",
  label: "Verkoopopbrengst",
  amount: 0,
  ...over,
});

const propertyDoc = (
  amounts: PropertyAmount[],
  over: Partial<PropertyStatementData> = {}
): PropertyStatementData => ({
  documentKind: "notarisafrekening",
  institution: "Notaris Jansen",
  taxYear: 2023,
  amounts,
  ...over,
});

describe("diffPropertyStatement", () => {
  it("counts an identical extraction as fully correct", () => {
    const expected = propertyDoc([
      propertyAmount({ kind: "saleProceeds", label: "Verkoopopbrengst", amount: 398000 }),
      propertyAmount({ kind: "notaryCosts", label: "Kosten notaris", amount: 850 }),
    ]);
    const diff = diffPropertyStatement(expected, structuredClone(expected));
    expect(diff.correct).toHaveLength(2);
    expect(diff.mismatched).toHaveLength(0);
    expect(isPropertyStatementPass(diff)).toBe(true);
  });

  it("pairs an amount by kind even when its label differs, reporting only the label as off", () => {
    // The vocabulary (kind), not the exact wording, is the matching identity — a differently
    // worded label is still paired to the right amount rather than counted as missing/unexpected.
    const expected = propertyDoc([
      propertyAmount({ kind: "saleProceeds", label: "Verkoopopbrengst woning", amount: 398000 }),
    ]);
    const actual = propertyDoc([
      propertyAmount({ kind: "saleProceeds", label: "Opbrengst verkoop", amount: 398000 }),
    ]);
    const diff = diffPropertyStatement(expected, actual);
    expect(diff.missing).toEqual([]);
    expect(diff.unexpected).toEqual([]);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toEqual(["label"]);
  });

  it("reports the amount as the differing field when only the amount is misread", () => {
    const expected = propertyDoc([
      propertyAmount({ kind: "wozValue", label: "WOZ-waarde", amount: 350000 }),
    ]);
    const actual = propertyDoc([
      propertyAmount({ kind: "wozValue", label: "WOZ-waarde", amount: 305000 }),
    ]);
    const diff = diffPropertyStatement(expected, actual);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toEqual(["amount"]);
  });

  it("pairs two null-kind amounts by their raw label", () => {
    // Neither side has a recognised kind, so label is the only identity left.
    const expected = propertyDoc([
      propertyAmount({ kind: null, label: "Administratiekosten", amount: 45 }),
    ]);
    const actual = propertyDoc([
      propertyAmount({ kind: null, label: "administratiekosten", amount: 50 }),
    ]);
    const diff = diffPropertyStatement(expected, actual);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toEqual(["amount"]);
  });

  it("reports a dropped amount as missing and a hallucinated one as unexpected", () => {
    const expected = propertyDoc([
      propertyAmount({ kind: "saleProceeds", amount: 398000 }),
      propertyAmount({ kind: "notaryCosts", label: "Kosten notaris", amount: 850 }),
    ]);
    const actual = propertyDoc([
      propertyAmount({ kind: "saleProceeds", amount: 398000 }),
      propertyAmount({ kind: "brokerCommission", label: "Courtage", amount: 4500 }),
    ]);
    const diff = diffPropertyStatement(expected, actual);
    expect(diff.missing.map((a) => a.kind)).toEqual(["notaryCosts"]);
    expect(diff.unexpected.map((a) => a.kind)).toEqual(["brokerCommission"]);
    expect(isPropertyStatementPass(diff)).toBe(false);
  });

  it("flags a misclassified document kind", () => {
    const expected = propertyDoc([]);
    const actual = propertyDoc([], { documentKind: "wozBeschikking" });
    const diff = diffPropertyStatement(expected, actual);
    expect(diff.documentKind.match).toBe(false);
    expect(isPropertyStatementPass(diff)).toBe(false);
  });

  it("flags a mismatched tax year", () => {
    const diff = diffPropertyStatement(propertyDoc([]), propertyDoc([], { taxYear: 2024 }));
    expect(diff.taxYear.match).toBe(false);
    expect(isPropertyStatementPass(diff)).toBe(false);
  });
});

describe("formatPropertyStatementDiffReport", () => {
  it("names each differing field for a mismatch", () => {
    const expected = propertyDoc([propertyAmount({ kind: "wozValue", amount: 350000 })]);
    const actual = propertyDoc([propertyAmount({ kind: "wozValue", amount: 305000 })]);
    const report = formatPropertyStatementDiffReport(
      "woz-beschikking-2023",
      diffPropertyStatement(expected, actual)
    );
    expect(report).toContain("woz-beschikking-2023");
    expect(report).toContain("amount");
    expect(report).toContain("350000");
    expect(report).toContain("305000");
  });

  it("reports a clean pass without listing mismatches", () => {
    const expected = propertyDoc([propertyAmount({ kind: "wozValue", amount: 350000 })]);
    const report = formatPropertyStatementDiffReport(
      "woz-beschikking-2023",
      diffPropertyStatement(expected, structuredClone(expected))
    );
    expect(report).toContain("PASS");
  });
});
