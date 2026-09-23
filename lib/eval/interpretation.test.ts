import { describe, expect, it } from "vitest";
import type { DeterministicReport } from "@/lib/report";
import type { AccountData, AnnualStatementData, Finding, TaxReturnEntry } from "@/lib/types";
import { summarizeReport, withoutKnownWrong, type ReportSummary } from "./interpretation";

// The summary is what an Interpretation fixture's expected.json records (#104). It must keep
// every row and its amounts (so a lost row fails the replay) and drop language-dependent text
// (so a translation edit does not).

const statement = (accounts: AccountData[]): AnnualStatementData => ({
  institution: "TestBank",
  institutionType: "bank",
  taxYear: 2023,
  accounts,
  metadata: {},
});

const account: AccountData = {
  accountNumber: "NL01TEST0000000001",
  description: "Betaalrekening",
  amounts: { bank: { balance: 900 } },
};

const entry: TaxReturnEntry = {
  box: "3",
  field: "Betaalrekening",
  accountNumber: "NL01 TEST 0000 0000 01",
  amount: 1000,
};

const finding = (kind: "duplicateRow" | "unrecognizedDocument"): Finding => ({
  kind,
  title: "title",
  detail: "detail",
});

function report(over: Partial<DeterministicReport> = {}): DeterministicReport {
  return {
    taxYear: 2023,
    covered: [],
    missingStatement: [],
    notFilledIn: [],
    propertyStatements: [],
    amountMismatches: [],
    findings: [],
    rulePoints: [],
    ...over,
  };
}

describe("summarizeReport", () => {
  it("counts the rows in every category and keeps each row's amounts", () => {
    const summary = summarizeReport(
      report({
        covered: [
          {
            field: "Spaarrekening",
            accountNumber: "NL02",
            institution: "TestBank",
            amountTaxReturn: 500,
            amountStatement: 500,
          },
          {
            field: "Spaarrekening",
            accountNumber: "NL02",
            institution: "TestBank",
            amountTaxReturn: 70,
            amountStatement: 70,
          },
        ],
        missingStatement: [{ field: "Loon", accountNumber: "", amount: 41200, box: "1" }],
        notFilledIn: [
          { accountNumber: "NL03", institution: "TestBank", description: "Spaar", amount: 12 },
        ],
      })
    );

    expect(summary.covered.count).toBe(2);
    expect(summary.covered.rows.map((r) => r.amountTaxReturn)).toEqual(
      expect.arrayContaining([500, 70])
    );
    expect(summary.missingStatement).toEqual({
      count: 1,
      rows: [{ field: "Loon", accountNumber: "", amount: 41200, box: "1" }],
    });
    expect(summary.notFilledIn.count).toBe(1);
    expect(summary.amountMismatches.count).toBe(0);
  });

  it("flattens an amount mismatch to the aangifte and bewijsstuk figures", () => {
    const summary = summarizeReport(
      report({
        amountMismatches: [
          {
            aangifte: entry,
            jaaropgave: { statement: statement([account]), account },
            amountStatement: 900,
          },
        ],
      })
    );

    expect(summary.amountMismatches).toEqual({
      count: 1,
      rows: [
        {
          field: "Betaalrekening",
          accountNumber: "NL01 TEST 0000 0000 01",
          institution: "TestBank",
          amountTaxReturn: 1000,
          amountStatement: 900,
        },
      ],
    });
  });

  it("falls back to the bewijsstuk rekeningnummer when the aangifte entry has none", () => {
    const summary = summarizeReport(
      report({
        amountMismatches: [
          {
            aangifte: { ...entry, accountNumber: null },
            jaaropgave: { statement: statement([account]), account },
            amountStatement: 900,
          },
        ],
      })
    );

    expect(summary.amountMismatches.rows[0].accountNumber).toBe("NL01TEST0000000001");
  });

  it("sorts rows by a stable key, so statement order does not change the summary", () => {
    const a = { accountNumber: "A", institution: "X", description: "d", amount: 1 };
    const b = { accountNumber: "B", institution: "X", description: "d", amount: 2 };

    expect(summarizeReport(report({ notFilledIn: [b, a] }))).toEqual(
      summarizeReport(report({ notFilledIn: [a, b] }))
    );
  });

  it("records findings as kind and count, without the translated text", () => {
    const summary = summarizeReport(
      report({
        findings: [
          finding("duplicateRow"),
          finding("unrecognizedDocument"),
          finding("duplicateRow"),
        ],
      })
    );

    expect(summary.findings).toEqual({
      count: 3,
      byKind: { duplicateRow: 2, unrecognizedDocument: 1 },
    });
  });

  it("records rule points as a count and the rekeningnummers they attach to", () => {
    const summary = summarizeReport(
      report({
        rulePoints: [
          { title: "t", explanation: "e", accountNumber: "NL05" },
          { title: "t", explanation: "e" },
        ],
      })
    );

    expect(summary.rulePoints).toEqual({ count: 2, accountNumbers: ["NL05"] });
  });

  it("lists each property statement with its amounts", () => {
    const summary = summarizeReport(
      report({
        propertyStatements: [
          {
            documentKind: "wozBeschikking",
            institution: "Gemeente",
            taxYear: 2023,
            amounts: [{ kind: "wozValue", label: "WOZ-waarde", amount: 362000 }],
          },
        ],
      })
    );

    expect(summary.propertyStatements).toEqual({
      count: 1,
      rows: [
        {
          documentKind: "wozBeschikking",
          institution: "Gemeente",
          amounts: [{ kind: "wozValue", amount: 362000 }],
        },
      ],
    });
  });
});

describe("withoutKnownWrong", () => {
  it("strips the marker so a known-wrong row is compared like any other", () => {
    const expected: ReportSummary = {
      ...summarizeReport(report()),
      missingStatement: {
        count: 1,
        rows: [
          {
            field: "Loon",
            accountNumber: "",
            amount: 1,
            box: "1",
            knownWrong: { issue: 1, note: "n" },
          },
        ],
      },
    };

    expect(withoutKnownWrong(expected).missingStatement.rows).toEqual([
      { field: "Loon", accountNumber: "", amount: 1, box: "1" },
    ]);
  });
});
