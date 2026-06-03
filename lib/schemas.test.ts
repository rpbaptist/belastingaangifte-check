import { describe, expect, it } from "vitest";
import { AnnualStatementSchema, TaxReturnSchema } from "./schemas";

const validStatement = {
  institution: "ING Bank N.V.",
  institutionType: "bank",
  taxYear: 2025,
  accounts: [
    {
      accountNumber: "NL00INGB0000000001",
      description: "Betaalrekening",
      amounts: { bank: { balance: 3080 } },
    },
  ],
  metadata: {},
};

const validTaxReturn = {
  taxYear: 2025,
  entries: [
    { box: "3", field: "Saldo bank", accountNumber: "NL00INGB0000000001", amount: 3080 },
  ],
};

describe("AnnualStatementSchema", () => {
  it("parses a valid statement", () => {
    expect(() => AnnualStatementSchema.parse(validStatement)).not.toThrow();
  });

  it("throws on missing institution field", () => {
    const bad = { ...validStatement, institution: undefined };
    expect(() => AnnualStatementSchema.parse(bad)).toThrow();
  });

  it("throws on invalid institutionType", () => {
    const bad = { ...validStatement, institutionType: "pension" };
    expect(() => AnnualStatementSchema.parse(bad)).toThrow();
  });
});

describe("TaxReturnSchema", () => {
  it("parses a valid tax return", () => {
    expect(() => TaxReturnSchema.parse(validTaxReturn)).not.toThrow();
  });

  it("throws on invalid box value", () => {
    const bad = {
      ...validTaxReturn,
      entries: [{ ...validTaxReturn.entries[0], box: "4" }],
    };
    expect(() => TaxReturnSchema.parse(bad)).toThrow();
  });

  it("rounds entry amount with cents to nearest integer", () => {
    const result = TaxReturnSchema.parse({
      ...validTaxReturn,
      entries: [{ ...validTaxReturn.entries[0], amount: 3080.67 }],
    });
    expect(result.entries[0].amount).toBe(3081);
  });

  it("rounds negative float amounts", () => {
    const result = TaxReturnSchema.parse({
      ...validTaxReturn,
      entries: [{ ...validTaxReturn.entries[0], amount: -102.4 }],
    });
    expect(result.entries[0].amount).toBe(-102);
  });
});

describe("AnnualStatementSchema — amount coercion", () => {
  it("rounds nested account amounts to integers", () => {
    const result = AnnualStatementSchema.parse({
      ...validStatement,
      accounts: [{ ...validStatement.accounts[0], amounts: { bank: { balance: 3080.21 } } }],
    });
    expect(result.accounts[0].amounts["bank"]?.["balance"]).toBe(3080);
  });
});
