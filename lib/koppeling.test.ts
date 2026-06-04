import { describe, expect, it } from "vitest";
import { koppeling } from "./koppeling";
import type { AnnualStatementData, TaxReturnData } from "./types";

function taxReturn(entries: TaxReturnData["entries"]): TaxReturnData {
  return { taxYear: 2025, entries };
}

function entry(
  field: string,
  amount: number,
  accountNumber: string | null = null,
  box: "1" | "2" | "3" = "3"
): TaxReturnData["entries"][number] {
  return { box, field, accountNumber, amount };
}

function statement(accountNumber: string, amounts: Record<string, Record<string, number>>): AnnualStatementData {
  return {
    institution: "Test",
    institutionType: "other",
    taxYear: 2025,
    metadata: {},
    accounts: [{ accountNumber, description: "Test", amounts }],
  };
}

describe("koppeling", () => {
  it("matches entries by account number", () => {
    const result = koppeling(
      taxReturn([entry("Saldo", 1000, "NL00INGB0000000001")]),
      [statement("NL00INGB0000000001", { bank: { balance: 1000 } })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("filters Eigenwoningforfait from onlyInAangifte", () => {
    const result = koppeling(
      taxReturn([entry("Eigenwoningforfait", 1848)]),
      []
    );
    expect(result.onlyInAangifte).toHaveLength(0);
  });

  it("secondary-matches Loon entry by amount when account number is null", () => {
    const result = koppeling(
      taxReturn([entry("Loon in Nederland", 100932, null, "1")]),
      [statement("employer-001", { wage: { taxableWage: 100932 } })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });
});
