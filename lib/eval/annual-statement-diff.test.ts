import { describe, it, expect } from "vitest";
import type { AnnualStatementData, AccountData } from "@/lib/types";
import {
  diffAnnualStatement,
  isAnnualStatementPass,
  formatAnnualStatementDiffReport,
} from "./annual-statement-diff";

// Sibling to lib/eval/diff.test.ts: pins the matching rules the jaaropgave perception score
// depends on (#106). Too strict flags normalisation as a misread; too loose hides a real one.

const account = (over: Partial<AccountData>): AccountData => ({
  accountNumber: "NL18RABO0332211004",
  description: "Spaarrekening",
  amounts: { bank: { balance: 15600 } },
  ...over,
});

const doc = (
  accounts: AccountData[],
  over: Partial<AnnualStatementData> = {}
): AnnualStatementData => ({
  institution: "Rabobank",
  institutionType: "bank",
  taxYear: 2023,
  accounts,
  metadata: {},
  ...over,
});

describe("diffAnnualStatement", () => {
  it("counts an identical extraction as fully correct", () => {
    const expected = doc([account({})]);
    const diff = diffAnnualStatement(expected, structuredClone(expected));
    expect(diff.correct).toHaveLength(1);
    expect(diff.mismatched).toHaveLength(0);
    expect(isAnnualStatementPass(diff)).toBe(true);
  });

  it("treats a differently formatted account number as correct", () => {
    const expected = doc([account({ accountNumber: "NL18RABO0332211004" })]);
    const actual = doc([account({ accountNumber: "NL18 RABO 0332 2110 04" })]);
    expect(isAnnualStatementPass(diffAnnualStatement(expected, actual))).toBe(true);
  });

  it("does not unmask a masked identifier — it only compares it as printed", () => {
    // DEGIRO's own jaaropgave masks its beleggingsrekening identifier (lib/reconciler.ts).
    // The correct extraction copies the mask verbatim; normalisation must not treat two
    // different masks as equal, or a real misread would be invisible.
    const expected = doc([account({ accountNumber: "******ist" })]);
    const sameMask = doc([account({ accountNumber: "******ist" })]);
    const wrongMask = doc([account({ accountNumber: "******ide" })]);
    expect(isAnnualStatementPass(diffAnnualStatement(expected, sameMask))).toBe(true);
    expect(isAnnualStatementPass(diffAnnualStatement(expected, wrongMask))).toBe(false);
  });

  it("names the exact amount path that was misread", () => {
    const expected = doc([account({ amounts: { bank: { balance: 15600 } } })]);
    const actual = doc([account({ amounts: { bank: { balance: 15500 } } })]);
    const diff = diffAnnualStatement(expected, actual);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toEqual(["amounts"]);
    expect(diff.mismatched[0].amountDiffs).toEqual([
      { path: "bank.balance", expected: 15600, actual: 15500 },
    ]);
  });

  it("keeps a cash and a portfolio component as one account, not two", () => {
    // A broker jaaropgave can show a geldrekening (cash) and beleggingsrekening (portfolio)
    // balance for the same account at the same date — both belong on one AccountData.
    const expected = doc([
      account({
        description: "Beleggingsrekening",
        amounts: { bank: { balance: -450 }, broker: { balance: 14780 } },
      }),
    ]);
    const diff = diffAnnualStatement(expected, structuredClone(expected));
    expect(diff.correct).toHaveLength(1);
    expect(isAnnualStatementPass(diff)).toBe(true);
  });

  it("pairs a wrong-account misread by amount instead of reporting missing + unexpected", () => {
    const expected = doc([
      account({ accountNumber: "NL18RABO0332211004", amounts: { bank: { balance: 15600 } } }),
    ]);
    const actual = doc([
      account({ accountNumber: "NL99WRNG0000000000", amounts: { bank: { balance: 15600 } } }),
    ]);
    const diff = diffAnnualStatement(expected, actual);
    expect(diff.mismatched).toHaveLength(1);
    expect(diff.mismatched[0].differing).toContain("accountNumber");
    expect(diff.missing).toHaveLength(0);
    expect(diff.unexpected).toHaveLength(0);
  });

  it("reports a dropped account as missing and a hallucinated one as unexpected", () => {
    const expected = doc([
      account({ accountNumber: "NL18RABO0332211004" }),
      account({ accountNumber: "NL89ABNA0123456789", description: "Spaarrekening 2" }),
    ]);
    const actual = doc([account({ accountNumber: "NL18RABO0332211004" })]);
    const diff = diffAnnualStatement(expected, actual);
    expect(diff.missing.map((a) => a.accountNumber)).toEqual(["NL89ABNA0123456789"]);

    const withGhost = doc([
      account({ accountNumber: "NL18RABO0332211004" }),
      account({ accountNumber: "NL00GHST0000000000", description: "Ghost" }),
    ]);
    const diffWithGhost = diffAnnualStatement(doc([account({})]), withGhost);
    expect(diffWithGhost.unexpected.map((a) => a.description)).toEqual(["Ghost"]);
  });

  it("flags a mismatched institution, institutionType or tax year", () => {
    const expected = doc([]);
    expect(
      isAnnualStatementPass(diffAnnualStatement(expected, doc([], { institution: "ABN AMRO" })))
    ).toBe(false);
    expect(
      isAnnualStatementPass(diffAnnualStatement(expected, doc([], { institutionType: "broker" })))
    ).toBe(false);
    expect(isAnnualStatementPass(diffAnnualStatement(expected, doc([], { taxYear: 2024 })))).toBe(
      false
    );
  });
});

describe("formatAnnualStatementDiffReport", () => {
  it("names the fixture, the differing field and both values", () => {
    const expected = doc([account({ amounts: { bank: { balance: 15600 } } })]);
    const actual = doc([account({ amounts: { bank: { balance: 15500 } } })]);
    const report = formatAnnualStatementDiffReport(
      "jaaropgave-rabobank-multi",
      diffAnnualStatement(expected, actual)
    );
    expect(report).toContain("jaaropgave-rabobank-multi");
    expect(report).toContain("bank.balance");
    expect(report).toContain("15600");
    expect(report).toContain("15500");
  });

  it("reports a clean pass without listing mismatches", () => {
    const expected = doc([account({})]);
    const report = formatAnnualStatementDiffReport(
      "jaaropgave-rabobank-multi",
      diffAnnualStatement(expected, structuredClone(expected))
    );
    expect(report).toContain("PASS");
  });
});
