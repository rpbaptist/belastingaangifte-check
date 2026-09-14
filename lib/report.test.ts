import { describe, expect, it } from "vitest";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { buildReport } from "./report";

function makeTaxReturn(overrides: Partial<TaxReturnData> = {}): TaxReturnData {
  return {
    taxYear: 2024,
    entries: [
      { box: "3", field: "Saldo bankrekening", accountNumber: "NL01 TEST", amount: 1000 },
      { box: "3", field: "Saldo spaarrekening", accountNumber: "NL02TEST", amount: 500 },
    ],
    ...overrides,
  };
}

function makeStatements(overrides: Partial<AnnualStatementData> = {}): AnnualStatementData[] {
  return [
    {
      institution: "TestBank",
      institutionType: "bank",
      taxYear: 2024,
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Betaalrekening",
          amounts: { bank: { balance: 1000 } },
        },
      ],
      metadata: {},
      ...overrides,
    },
  ];
}

describe("buildReport", () => {
  it("maps a Gedekt pair to covered with no mismatches or rule points", () => {
    const taxReturn = makeTaxReturn({ entries: [makeTaxReturn().entries[0]] });
    const result = buildReport(taxReturn, makeStatements(), "nl");

    expect(result.taxYear).toBe(2024);
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0]).toMatchObject({
      field: "Saldo bankrekening",
      institution: "TestBank",
    });
    expect(result.amountMismatches).toEqual([]);
    expect(result.missingStatement).toEqual([]);
    expect(result.notFilledIn).toEqual([]);
    expect(result.rulePoints).toEqual([]);
  });

  it("places an unmatched aangifte entry in missingStatement (Jaaropgave ontbreekt)", () => {
    const result = buildReport(makeTaxReturn(), makeStatements(), "nl");

    expect(result.covered).toHaveLength(1);
    expect(result.missingStatement).toHaveLength(1);
    expect(result.missingStatement[0]).toMatchObject({
      field: "Saldo spaarrekening",
      amount: 500,
    });
    expect(result.amountMismatches).toEqual([]);
  });

  it("places a matched pair with >€1 difference in amountMismatches", () => {
    const taxReturn = makeTaxReturn({
      entries: [{ box: "3", field: "Saldo bankrekening", accountNumber: "NL01TEST", amount: 1000 }],
    });
    const statements = makeStatements({
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Betaalrekening",
          amounts: { bank: { balance: 1100 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, "nl");

    expect(result.covered).toEqual([]);
    expect(result.amountMismatches).toHaveLength(1);
    expect(result.amountMismatches[0].amountStatement).toBe(1100);
    expect(result.amountMismatches[0].aangifte.amount).toBe(1000);
  });

  it("places an unmatched jaaropgave account in notFilledIn (Niet ingevuld in aangifte)", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const result = buildReport(taxReturn, makeStatements(), "nl");

    expect(result.notFilledIn).toHaveLength(1);
    expect(result.notFilledIn[0]).toMatchObject({
      institution: "TestBank",
      amount: 1000,
    });
  });

  it("suppresses zero-balance jaaropgave accounts from notFilledIn", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const statements = makeStatements({
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Betaalrekening",
          amounts: { bank: { balance: 0 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, "nl");

    expect(result.notFilledIn).toEqual([]);
  });

  it("surfaces rule points from statements with a Dutch title by default", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const statements = makeStatements({
      institutionType: "mortgage",
      metadata: { mortgageType: "aflossingsvrij" },
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Hypotheek",
          amounts: { mortgage: { interestPaid: 8400, remainingDebt: 200000 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, "nl");

    expect(result.rulePoints.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(true);
  });

  it("translates rule points when language is 'en'", () => {
    const taxReturn = makeTaxReturn({ entries: [] });
    const statements = makeStatements({
      institutionType: "mortgage",
      metadata: { mortgageType: "aflossingsvrij" },
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Hypotheek",
          amounts: { mortgage: { interestPaid: 8400, remainingDebt: 200000 } },
        },
      ],
    });

    const result = buildReport(taxReturn, statements, "en");

    expect(result.rulePoints.some((p) => p.title === "Interest-only mortgage")).toBe(true);
  });

  it("handles multiple accounts across multiple statements", () => {
    const taxReturn = makeTaxReturn({
      entries: [{ box: "3", field: "Saldo bankrekening", accountNumber: "NL01TEST", amount: 1000 }],
    });
    const statements: AnnualStatementData[] = [
      ...makeStatements(),
      {
        institution: "OtherBank",
        institutionType: "bank",
        taxYear: 2024,
        accounts: [
          {
            accountNumber: "NL03TEST",
            description: "Spaarrekening",
            amounts: { bank: { balance: 2000 } },
          },
        ],
        metadata: {},
      },
    ];

    const result = buildReport(taxReturn, statements, "nl");

    expect(result.covered).toHaveLength(1);
    expect(result.notFilledIn).toHaveLength(1);
    expect(result.notFilledIn[0]).toMatchObject({ institution: "OtherBank", amount: 2000 });
  });

  it("is deterministic: repeated calls return deep-equal results", () => {
    const taxReturn = makeTaxReturn();
    const statements = makeStatements();
    const first = buildReport(taxReturn, statements, "nl");
    const second = buildReport(taxReturn, statements, "nl");

    expect(second).toEqual(first);
  });
});
