import { describe, expect, test } from "vitest";
import { buildCovered } from "./coverage-checker";
import type { MatchedPair } from "./account-matcher";
import type { AccountData, AnnualStatementData, TaxReturnEntry } from "./types";

function makePair(
  field: string,
  amount: number,
  accountNumber: string,
  institutionType: AnnualStatementData["institutionType"],
  accountAmounts: AccountData["amounts"],
): MatchedPair {
  const statement: AnnualStatementData = {
    institution: "Test Instelling",
    institutionType,
    taxYear: 2024,
    accounts: [],
    metadata: {},
  };
  const account: AccountData = { accountNumber, description: "test account", amounts: accountAmounts };
  const aangifte: TaxReturnEntry = { box: "3", field, accountNumber, amount };
  return { aangifte, jaaropgave: { statement, account } };
}

describe("buildCovered", () => {
  test("standard bank balance exact match", () => {
    const pair = makePair("Saldo bank en spaarrekeningen", 12345, "NL01TEST001", "bank", { bank: { balance: 12345 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
    expect(result[0].amountTaxReturn).toBe(12345);
    expect(result[0].amountStatement).toBe(12345);
    expect(result[0].institution).toBe("Test Instelling");
    expect(result[0].accountNumber).toBe("NL01TEST001");
  });

  test("rounding tolerance — difference of 1 is covered", () => {
    const pair = makePair("Saldo bank en spaarrekeningen", 12345, "NL01TEST001", "bank", { bank: { balance: 12346 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
  });

  test("outside tolerance — difference of 2 is not covered", () => {
    const pair = makePair("Saldo bank en spaarrekeningen", 12345, "NL01TEST001", "bank", { bank: { balance: 12347 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(0);
  });

  test("mortgage sign flip — negative aangifte vs positive interestPaid", () => {
    const pair = makePair("Betaalde rente hypotheek", -3200, "Nummer123", "mortgage", { mortgage: { interestPaid: 3200 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
    expect(result[0].amountTaxReturn).toBe(-3200);
    expect(result[0].amountStatement).toBe(3200);
  });

  test("mortgage mismatch after abs is not covered", () => {
    const pair = makePair("Betaalde rente hypotheek", -3200, "Nummer123", "mortgage", { mortgage: { interestPaid: 3205 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(0);
  });

  test("geldrekening split — bank side matched by field keyword", () => {
    const pair = makePair("DEGIRO geldrekening", 1000, "1019345793", "broker", {
      bank: { balance: 1000 },
      broker: { balance: 50000 },
    });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
    expect(result[0].amountStatement).toBe(1000);
  });

  test("geldrekening split — broker side matched by field keyword", () => {
    const pair = makePair("DEGIRO beleggingen", 50000, "1019345793", "broker", {
      bank: { balance: 1000 },
      broker: { balance: 50000 },
    });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
    expect(result[0].amountStatement).toBe(50000);
  });

  test("Dutch dividend tax routing", () => {
    const pair = makePair("Ingehouden dividendbelasting", 75, "NL01TEST001", "broker", { broker: { dutchDividendTax: 75 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
    expect(result[0].amountStatement).toBe(75);
  });

  test("foreign withholding tax routing", () => {
    const pair = makePair("Verrekenbare buitenlandse bronbelasting", 30, "NL01TEST001", "broker", { broker: { foreignWithholdingTax: 30 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
    expect(result[0].amountStatement).toBe(30);
  });

  test("standalone dividend income routing", () => {
    const pair = makePair("Dividend", 500, "NL01TEST001", "broker", { broker: { dividend: 500 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(1);
    expect(result[0].amountStatement).toBe(500);
  });

  test("dutchDividendTax grouping — two entries sum to match", () => {
    const statement: AnnualStatementData = {
      institution: "ING",
      institutionType: "broker",
      taxYear: 2024,
      accounts: [],
      metadata: {},
    };
    const account: AccountData = {
      accountNumber: "NL01INGB001",
      description: "ING Beleggen",
      amounts: { broker: { dutchDividendTax: 75 } },
    };
    const pair1: MatchedPair = {
      aangifte: { box: "1", field: "Ingehouden dividendbelasting", accountNumber: "NL01INGB001", amount: 45 },
      jaaropgave: { statement, account },
    };
    const pair2: MatchedPair = {
      aangifte: { box: "1", field: "Ingehouden dividendbelasting", accountNumber: "NL01INGB001", amount: 30 },
      jaaropgave: { statement, account },
    };
    const result = buildCovered([pair1, pair2]);
    expect(result).toHaveLength(1);
    expect(result[0].amountTaxReturn).toBe(75);
    expect(result[0].amountStatement).toBe(75);
  });

  test("no route available — pair is omitted", () => {
    const pair = makePair("Onbekend veld XYZ", 500, "NL01TEST001", "other", { other: { unknownField: 500 } });
    const result = buildCovered([pair]);
    expect(result).toHaveLength(0);
  });
});
