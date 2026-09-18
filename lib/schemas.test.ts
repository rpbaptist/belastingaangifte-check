import { describe, expect, it } from "vitest";
import { AnnualStatementSchema, StatementExtractionSchema, TaxReturnSchema } from "./schemas";

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
  entries: [{ box: "3", field: "Saldo bank", accountNumber: "NL00INGB0000000001", amount: 3080 }],
};

describe("AnnualStatementSchema", () => {
  it("parses a valid statement", () => {
    expect(() => AnnualStatementSchema.parse(validStatement)).not.toThrow();
  });

  it("throws on missing institution field", () => {
    const bad = { ...validStatement, institution: undefined };
    expect(() => AnnualStatementSchema.parse(bad)).toThrow();
  });

  it("coerces unknown institutionType to 'other'", () => {
    const result = AnnualStatementSchema.parse({ ...validStatement, institutionType: "pension" });
    expect(result.institutionType).toBe("other");
  });

  it("coerces missing institutionType to 'other'", () => {
    const { institutionType: _, ...rest } = validStatement;
    const result = AnnualStatementSchema.parse(rest);
    expect(result.institutionType).toBe("other");
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

  it("rounds entry amounts to whole euros", () => {
    const result = TaxReturnSchema.parse({
      ...validTaxReturn,
      entries: [{ ...validTaxReturn.entries[0], amount: 3080.67 }],
    });
    expect(result.entries[0].amount).toBe(3081);
  });

  it("rounds negative float amounts to whole euros", () => {
    const result = TaxReturnSchema.parse({
      ...validTaxReturn,
      entries: [{ ...validTaxReturn.entries[0], amount: -102.4 }],
    });
    expect(result.entries[0].amount).toBe(-102);
  });
});

describe("StatementExtractionSchema", () => {
  it("reshapes a jaaropgave-kind extraction into the { documentKind, annualStatement } wrapper", () => {
    const result = StatementExtractionSchema.parse({
      ...validStatement,
      documentKind: "jaaropgave",
    });
    expect(result).toEqual({
      documentKind: "jaaropgave",
      annualStatement: validStatement,
    });
  });

  it("reshapes a notarisafrekening extraction into the { documentKind, propertyStatement } wrapper", () => {
    const raw = {
      documentKind: "notarisafrekening",
      institution: "Notaris Jansen",
      taxYear: 2024,
      amounts: [{ kind: "saleProceeds", label: "Verkoopopbrengst", amount: 425000 }],
    };
    const result = StatementExtractionSchema.parse(raw);
    expect(result).toEqual({
      documentKind: "notarisafrekening",
      propertyStatement: raw,
    });
  });

  it("parses wozBeschikking and makelaarsnota the same way", () => {
    for (const documentKind of ["wozBeschikking", "makelaarsnota"]) {
      const raw = { documentKind, institution: "Gemeente", taxYear: 2024, amounts: [] };
      const result = StatementExtractionSchema.parse(raw);
      expect(result).toEqual({ documentKind, propertyStatement: raw });
    }
  });

  it("keeps a property amount whose kind is outside the closed set as null, preserving its label", () => {
    // An amount that fits no kind is reported (via the label), never invented into a new key.
    const raw = {
      documentKind: "makelaarsnota",
      institution: "Makelaar Pietersen",
      taxYear: 2024,
      amounts: [{ kind: "administrationFee", label: "Administratiekosten", amount: 45 }],
    };
    const result = StatementExtractionSchema.parse(raw);
    expect(result).toMatchObject({
      documentKind: "makelaarsnota",
      propertyStatement: {
        amounts: [{ kind: null, label: "Administratiekosten", amount: 45 }],
      },
    });
  });

  it("passes through an unrecognized document without a data payload", () => {
    const result = StatementExtractionSchema.parse({
      documentKind: "unrecognized",
      institution: "Mystery BV",
      taxYear: 2024,
    });
    expect(result).toEqual({
      documentKind: "unrecognized",
      institution: "Mystery BV",
      taxYear: 2024,
    });
  });

  it("coerces a missing taxYear to null for an unrecognized document rather than throwing", () => {
    const result = StatementExtractionSchema.parse({
      documentKind: "unrecognized",
      institution: "",
    });
    expect(result).toMatchObject({ documentKind: "unrecognized", taxYear: null });
  });

  it("never extracts an accountNumber for a property document kind", () => {
    // Property bewijsstukken carry no rekeningnummer (ADR 0002 amendment) — the schema has
    // no field for one, so a model that emits one anyway gets it silently stripped. toEqual
    // (not toMatchObject) fails on any extra key, so a leaked accountNumber would show up.
    const raw = {
      documentKind: "notarisafrekening",
      institution: "Notaris Jansen",
      taxYear: 2024,
      accountNumber: "NL91INGB0001234567",
      amounts: [{ kind: "saleProceeds", label: "Verkoopopbrengst", amount: 425000 }],
    };
    const result = StatementExtractionSchema.parse(raw);
    expect(result).toEqual({
      documentKind: "notarisafrekening",
      propertyStatement: {
        documentKind: "notarisafrekening",
        institution: "Notaris Jansen",
        taxYear: 2024,
        amounts: [{ kind: "saleProceeds", label: "Verkoopopbrengst", amount: 425000 }],
      },
    });
  });

  it("rejects a documentKind outside the closed set", () => {
    expect(() =>
      StatementExtractionSchema.parse({
        documentKind: "erfpachtcanon",
        institution: "Test",
        taxYear: 2024,
      })
    ).toThrow();
  });
});

describe("AnnualStatementSchema — amount coercion", () => {
  it("preserves cents on nested account amounts", () => {
    const result = AnnualStatementSchema.parse({
      ...validStatement,
      accounts: [{ ...validStatement.accounts[0], amounts: { bank: { balance: 3080.21 } } }],
    });
    const amounts = result.accounts[0].amounts as { bank: { balance: number } };
    expect(amounts.bank.balance).toBe(3080.21);
  });
});
