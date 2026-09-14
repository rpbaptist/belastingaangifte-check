import { describe, expect, it } from "vitest";
import type { AnnualStatementData, TaxReturnData } from "./types";
import { buildReport } from "./report";

const taxReturn: TaxReturnData = {
  taxYear: 2024,
  entries: [
    { box: "3", field: "Saldo bankrekening", accountNumber: "NL01 TEST", amount: 1000 },
    { box: "3", field: "Saldo spaarrekening", accountNumber: "NL02TEST", amount: 500 },
  ],
};

const statements: AnnualStatementData[] = [
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
  },
];

describe("buildReport", () => {
  it("maps a Gedekt pair to covered with no mismatches or rule points", () => {
    const single: TaxReturnData = { taxYear: 2024, entries: [taxReturn.entries[0]] };
    const result = buildReport(single, statements, "nl");

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
    const result = buildReport(taxReturn, statements, "nl");

    expect(result.covered).toHaveLength(1);
    expect(result.missingStatement).toHaveLength(1);
    expect(result.missingStatement[0]).toMatchObject({
      field: "Saldo spaarrekening",
      amount: 500,
    });
    expect(result.amountMismatches).toEqual([]);
  });

  it("is deterministic: repeated calls return deep-equal results", () => {
    const first = buildReport(taxReturn, statements, "nl");
    const second = buildReport(taxReturn, statements, "nl");

    expect(second).toEqual(first);
  });
});
