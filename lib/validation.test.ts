import { describe, expect, it } from "vitest";
import { validateStatements } from "./validation";
import type { AnnualStatementData, PropertyStatementData, TaxReturnData } from "./types";

function makeTaxReturn(taxYear = 2024): TaxReturnData {
  return { taxYear, entries: [] };
}

function makeStatement(overrides: Partial<AnnualStatementData> = {}): AnnualStatementData {
  return {
    institution: "TestBank",
    institutionType: "bank",
    taxYear: 2024,
    metadata: {},
    accounts: [
      {
        accountNumber: "NL01TEST",
        description: "Betaalrekening",
        amounts: { bank: { balance: 1000 } },
      },
    ],
    ...overrides,
  };
}

function makePropertyStatement(
  overrides: Partial<PropertyStatementData> = {}
): PropertyStatementData {
  return {
    documentKind: "notarisafrekening",
    institution: "Notaris Jansen",
    taxYear: 2024,
    amounts: [{ kind: "saleProceeds", label: "Verkoopopbrengst", amount: 425000 }],
    ...overrides,
  };
}

describe("validateStatements", () => {
  it("returns no findings for clean, in-year statements", () => {
    // The happy path must stay quiet: a finding is a signal the tool could not read
    // something, so a well-formed statement producing one would cry wolf.
    expect(validateStatements(makeTaxReturn(), [makeStatement()], [], [], "nl")).toEqual([]);
  });

  it("reports a bewijsstuk whose tax year differs from the aangifte", () => {
    // A statement for the wrong year silently matched nothing before; now the mismatch is
    // named so a jaaropgave filed against last year's return can't pass as this year's.
    const findings = validateStatements(
      makeTaxReturn(2024),
      [makeStatement({ taxYear: 2023 })],
      [],
      [],
      "nl"
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("taxYearMismatch");
    // A wrong-year document is not fixed by editing an amount, so it carries no numeric
    // proposedCorrection (that field is reserved for amount before/after per ADR 0008).
    expect(findings[0].proposedCorrection).toBeUndefined();
    expect(findings[0].detail).toContain("2023");
    expect(findings[0].detail).toContain("2024");
  });

  it("reports an amount whose sign contradicts its kind", () => {
    // Jaaropgave amounts are magnitudes; a negative dividend tax is a misread sign, not a
    // real credit. The proposed correction carries the flipped value as data — never applied.
    const statement = makeStatement({
      institutionType: "broker",
      accounts: [
        {
          accountNumber: "BRK1",
          description: "Beleggingen",
          amounts: { broker: { dutchDividendTax: -75 } },
        },
      ],
    });
    const findings = validateStatements(makeTaxReturn(), [statement], [], [], "nl");

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("signContradiction");
    expect(findings[0].proposedCorrection).toEqual({ before: -75, after: 75 });
  });

  it("does not flag a negative bank balance (a legitimate overdraft)", () => {
    // A current account can be genuinely negative; flagging it would drown the real misreads.
    const statement = makeStatement({
      accounts: [
        { accountNumber: "NL01TEST", description: "Betaal", amounts: { bank: { balance: -250 } } },
      ],
    });
    expect(validateStatements(makeTaxReturn(), [statement], [], [], "nl")).toEqual([]);
  });

  it("does not flag a negative brokerage balance (a margin debit or Box 3 debt)", () => {
    // Not only bank balances go negative — a brokerage account can too. The exemption is on
    // the 'balance' kind, not on one institution, so a real negative position isn't a misread.
    const statement = makeStatement({
      institutionType: "broker",
      accounts: [
        {
          accountNumber: "BRK1",
          description: "Beleggingen",
          amounts: { broker: { balance: -1200 } },
        },
      ],
    });
    expect(validateStatements(makeTaxReturn(), [statement], [], [], "nl")).toEqual([]);
  });

  it("reports an amount of a kind nothing downstream understands", () => {
    // Extraction may emit a category the reconciler/categorizer never read; reporting it
    // keeps a genuine position from vanishing without a trace.
    const statement = makeStatement({
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Crypto",
          amounts: { crypto: { balance: 5000 } },
        },
      ],
    });
    const findings = validateStatements(makeTaxReturn(), [statement], [], [], "nl");

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("unknownAmountKind");
    expect(findings[0].field).toBe("crypto");
  });

  it("does not treat a negative amount inside an unknown category as a sign contradiction", () => {
    // An unknown kind is reported once as unknown, not doubly as a sign problem we can't judge.
    const statement = makeStatement({
      accounts: [
        {
          accountNumber: "NL01TEST",
          description: "Crypto",
          amounts: { crypto: { balance: -5000 } },
        },
      ],
    });
    const findings = validateStatements(makeTaxReturn(), [statement], [], [], "nl");

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("unknownAmountKind");
  });

  it("does not report an unknown category that carries no amount", () => {
    // An empty (or all-null) unknown category is not an amount that got dropped, so claiming
    // 'the document carries an amount of kind X' would be a false finding.
    const statement = makeStatement({
      accounts: [{ accountNumber: "NL01TEST", description: "Leeg", amounts: { insurance: {} } }],
    });
    expect(validateStatements(makeTaxReturn(), [statement], [], [], "nl")).toEqual([]);
  });

  it("translates finding text for English", () => {
    const findings = validateStatements(
      makeTaxReturn(2024),
      [makeStatement({ taxYear: 2023 })],
      [],
      [],
      "en"
    );
    expect(findings[0].title).toBe("Tax year differs");
  });

  it("is deterministic across repeated calls", () => {
    const statement = makeStatement({ taxYear: 2023 });
    const first = validateStatements(makeTaxReturn(), [statement], [], [], "nl");
    const second = validateStatements(makeTaxReturn(), [statement], [], [], "nl");
    expect(second).toEqual(first);
  });

  it("returns no findings for a clean, in-year property bewijsstuk", () => {
    // Every amount kind is in the closed set, so nothing should be flagged.
    expect(validateStatements(makeTaxReturn(), [], [makePropertyStatement()], [], "nl")).toEqual(
      []
    );
  });

  it("reports a property amount outside the closed kind set as unknownAmountKind, keyed by its raw label", () => {
    const statement = makePropertyStatement({
      amounts: [{ kind: null, label: "Administratiekosten", amount: 45 }],
    });
    const findings = validateStatements(makeTaxReturn(), [], [statement], [], "nl");

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("unknownAmountKind");
    expect(findings[0].field).toBe("Administratiekosten");
    expect(findings[0].institution).toBe("Notaris Jansen");
  });

  it("reports a property bewijsstuk whose tax year differs from the aangifte", () => {
    const statement = makePropertyStatement({ taxYear: 2023 });
    const findings = validateStatements(makeTaxReturn(2024), [], [statement], [], "nl");

    expect(findings.some((f) => f.kind === "taxYearMismatch")).toBe(true);
  });

  it("reports an unrecognized document so it says so rather than silently having no effect", () => {
    const findings = validateStatements(
      makeTaxReturn(),
      [],
      [],
      [{ institution: "Onbekend BV", taxYear: 2024 }],
      "nl"
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("unrecognizedDocument");
    expect(findings[0].institution).toBe("Onbekend BV");
    expect(findings[0].detail).toContain("Onbekend BV");
  });

  it("reports an unrecognized document with no legible institution without crashing", () => {
    const findings = validateStatements(
      makeTaxReturn(),
      [],
      [],
      [{ institution: "", taxYear: null }],
      "nl"
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("unrecognizedDocument");
    expect(findings[0].institution).toBeUndefined();
  });
});
