import { describe, expect, it } from "vitest";
import { categorize } from "./categorizer";
import type { MatchResult } from "./reconciler";
import type { AnnualStatementData, TaxReturnEntry } from "./types";

function makeMatchResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    matched: [],
    onlyInAangifte: [],
    onlyInJaaropgave: [],
    ...overrides,
  };
}

function makeStatement(
  institution: string,
  institutionType: AnnualStatementData["institutionType"],
  accountNumber: string,
  amounts: Record<string, Record<string, number>>
): AnnualStatementData {
  return {
    institution,
    institutionType,
    taxYear: 2024,
    metadata: {},
    accounts: [{ accountNumber, description: "Test", amounts }],
  };
}

function makeEntry(
  field: string,
  amount: number,
  accountNumber: string | null = "NL00TEST0000000001",
  box: "1" | "2" | "3" = "3"
): TaxReturnEntry {
  return { box, field, accountNumber, amount };
}

// ─── covered / missingStatement / notFilledIn assembly ─────────────────────

describe("categorize — basic assembly", () => {
  it("produces empty arrays for empty MatchResult", () => {
    const result = categorize(makeMatchResult());
    expect(result.covered).toHaveLength(0);
    expect(result.missingStatement).toHaveLength(0);
    expect(result.notFilledIn).toHaveLength(0);
    expect(result.amountMismatches).toHaveLength(0);
  });

  it("maps onlyInAangifte to missingStatement", () => {
    const entry = makeEntry("Saldo bank", 5000, "NL00TEST0000000001", "3");
    const result = categorize(makeMatchResult({ onlyInAangifte: [entry] }));
    expect(result.missingStatement).toHaveLength(1);
    expect(result.missingStatement[0].field).toBe("Saldo bank");
    expect(result.missingStatement[0].amount).toBe(5000);
    expect(result.missingStatement[0].box).toBe("3");
  });

  it("maps onlyInJaaropgave to notFilledIn with primary non-zero amount", () => {
    const statement = makeStatement("ING", "bank", "NL00INGB0000000001", {
      bank: { balance: 3000 },
    });
    const result = categorize(
      makeMatchResult({ onlyInJaaropgave: [{ statement, account: statement.accounts[0] }] })
    );
    expect(result.notFilledIn).toHaveLength(1);
    expect(result.notFilledIn[0].amount).toBe(3000);
    expect(result.notFilledIn[0].institution).toBe("ING");
  });

  it("falls back to aangifte accountNumber when null, using jaaropgave accountNumber", () => {
    const statement = makeStatement("ING", "bank", "NL00INGB0000000001", {
      bank: { balance: 5000 },
    });
    const entry = makeEntry("Saldo bank", 5000, null, "3");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered[0].accountNumber).toBe("NL00INGB0000000001");
  });
});

// ─── €1 tolerance ───────────────────────────────────────────────────────────

describe("categorize — €1 tolerance", () => {
  it("places matched bank pair within €1 in covered", () => {
    const statement = makeStatement("ING", "bank", "NL00INGB0000000001", {
      bank: { balance: 5001 },
    });
    const entry = makeEntry("Saldo bank", 5000, "NL00INGB0000000001");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.amountMismatches).toHaveLength(0);
    expect(result.covered[0].amountTaxReturn).toBe(5000);
    expect(result.covered[0].amountStatement).toBe(5001);
  });

  it("places matched pair with >€1 difference in amountMismatches", () => {
    const statement = makeStatement("ING", "bank", "NL00INGB0000000001", {
      bank: { balance: 5100 },
    });
    const entry = makeEntry("Saldo bank", 5000, "NL00INGB0000000001");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(0);
    expect(result.amountMismatches).toHaveLength(1);
    expect(result.amountMismatches[0].amountStatement).toBe(5100);
  });

  it("treats unknown amount (null) as covered", () => {
    // institution "other" with no recognized fields → getJaaropgaveAmount returns null
    const statement = makeStatement("Employer", "other", "employer-001", {
      wage: { taxableWage: 100000 },
    });
    const entry = makeEntry("Onbekend veld", 99999, "employer-001");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.amountMismatches).toHaveLength(0);
  });
});

// ─── Bank / broker amounts ───────────────────────────────────────────────────

describe("categorize — bank and broker amounts", () => {
  it("compares bank balance directly", () => {
    const statement = makeStatement("ING", "bank", "NL00INGB0000000001", {
      bank: { balance: 5000 },
    });
    const entry = makeEntry("Saldo bank", 5000, "NL00INGB0000000001");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
  });

  it("compares negative bank balance (credit card debt) with sign preserved", () => {
    const statement = makeStatement("ING", "bank", "creditcard-001", { bank: { balance: -1500 } });
    const entry = makeEntry("Saldo creditcard", -1500, "creditcard-001");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
  });

  it("flags sign mismatch as amountMismatch", () => {
    const statement = makeStatement("ING", "bank", "creditcard-001", { bank: { balance: -1500 } });
    const entry = makeEntry("Saldo creditcard", 1500, "creditcard-001");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.amountMismatches).toHaveLength(1);
  });

  it("compares broker balance for broker account", () => {
    const statement = makeStatement("DEGIRO", "broker", "johndoe/1234", {
      broker: { balance: 12000 },
    });
    const entry = makeEntry("Beleggingen DEGIRO", 12000, "johndoe/1234");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
  });
});

// ─── Geldrekening / beleggingen split ───────────────────────────────────────

describe("categorize — geldrekening / beleggingen split", () => {
  it("routes geldrekening aangifte entry to bank.balance", () => {
    const statement = makeStatement("ASN", "broker", "NL00ASN0000000001", {
      bank: { balance: 500 },
      broker: { balance: 8000 },
    });
    const geldrekeningEntry = makeEntry("Geldrekening ASN", 500, "NL00ASN0000000001");
    const result = categorize(
      makeMatchResult({
        matched: [
          {
            aangifte: geldrekeningEntry,
            jaaropgave: { statement, account: statement.accounts[0] },
          },
        ],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0].amountStatement).toBe(500);
  });

  it("routes beleggingen aangifte entry to broker.balance", () => {
    const statement = makeStatement("ASN", "broker", "NL00ASN0000000001", {
      bank: { balance: 500 },
      broker: { balance: 8000 },
    });
    const beleggingEntry = makeEntry("ASN Themabeleggen", 8000, "NL00ASN0000000001");
    const result = categorize(
      makeMatchResult({
        matched: [
          { aangifte: beleggingEntry, jaaropgave: { statement, account: statement.accounts[0] } },
        ],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0].amountStatement).toBe(8000);
  });
});

// ─── Dividend field mapping ──────────────────────────────────────────────────

describe("categorize — dividend field mapping", () => {
  it("maps Ingehouden dividendbelasting to broker.dutchDividendTax", () => {
    const statement = makeStatement("ASN", "broker", "NL00ASN0000000001", {
      broker: { balance: 8000, dutchDividendTax: 75, dividend: 500 },
    });
    const entry = makeEntry("Ingehouden dividendbelasting", 75, "NL00ASN0000000001");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0].amountStatement).toBe(75);
  });

  it("maps Verrekenbare buitenlandse bronbelasting to broker.foreignWithholdingTax", () => {
    const statement = makeStatement("DEGIRO", "broker", "johndoe/1234", {
      broker: { balance: 10000, foreignWithholdingTax: 30 },
    });
    const entry = makeEntry("Verrekenbare buitenlandse bronbelasting", 30, "johndoe/1234");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0].amountStatement).toBe(30);
  });

  it("maps Bronheffing to broker.foreignWithholdingTax", () => {
    const statement = makeStatement("DEGIRO", "broker", "johndoe/1234", {
      broker: { balance: 10000, foreignWithholdingTax: 30 },
    });
    const entry = makeEntry("Buitenlandse bronheffing", 30, "johndoe/1234");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0].amountStatement).toBe(30);
  });
});

// ─── Mortgage interest (sign handling) ─────────────────────────────────────

describe("categorize — mortgage interest sign handling", () => {
  it("compares negative aangifte rente against positive jaaropgave interestPaid", () => {
    const statement = makeStatement("Hypotheekbank", "mortgage", "NL00HYPO0000000001", {
      mortgage: { interestPaid: 8400, remainingDebt: 200000 },
    });
    const entry = makeEntry("Aftrekbare rente van schuld", -8400, "NL00HYPO0000000001", "1");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
    expect(result.covered[0].amountTaxReturn).toBe(-8400);
    expect(result.covered[0].amountStatement).toBe(-8400);
  });

  it("flags mortgage rente mismatch correctly", () => {
    const statement = makeStatement("Hypotheekbank", "mortgage", "NL00HYPO0000000001", {
      mortgage: { interestPaid: 9000, remainingDebt: 200000 },
    });
    const entry = makeEntry("Aftrekbare rente van schuld", -8400, "NL00HYPO0000000001", "1");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.amountMismatches).toHaveLength(1);
    expect(result.amountMismatches[0].amountStatement).toBe(-9000);
  });
});

// ─── Wage matching ──────────────────────────────────────────────────────────

describe("categorize — wage matching", () => {
  it("compares Loon entry against wage.taxableWage", () => {
    const statement = makeStatement("Employer", "other", "employer-001", {
      wage: { taxableWage: 60000 },
    });
    const entry = makeEntry("Loon in Nederland", 60000, null, "1");
    const result = categorize(
      makeMatchResult({
        matched: [{ aangifte: entry, jaaropgave: { statement, account: statement.accounts[0] } }],
      })
    );
    expect(result.covered).toHaveLength(1);
  });
});

// ─── Mid-year closed mortgage filter ────────────────────────────────────────

describe("categorize — mid-year closed mortgage", () => {
  it("excludes a mortgage with a tiny interest/debt ratio from notFilledIn", () => {
    // €104 interest on €89,956 debt ≈ 0.1% — clearly closed mid-year
    const statement = makeStatement("Rabobank", "mortgage", "Nummer192658069", {
      mortgage: { interestPaid: 104, remainingDebt: 89956 },
    });
    const result = categorize(
      makeMatchResult({ onlyInJaaropgave: [{ statement, account: statement.accounts[0] }] })
    );
    expect(result.notFilledIn).toHaveLength(0);
  });

  it("keeps a normal mortgage (high interest/debt ratio) in notFilledIn", () => {
    const statement = makeStatement("Rabobank", "mortgage", "Nummer192658069", {
      mortgage: { interestPaid: 8400, remainingDebt: 200000 },
    });
    const result = categorize(
      makeMatchResult({ onlyInJaaropgave: [{ statement, account: statement.accounts[0] }] })
    );
    expect(result.notFilledIn).toHaveLength(1);
  });

  it("keeps a mortgage with zero remainingDebt in notFilledIn", () => {
    // remainingDebt = 0 means the debt is fully repaid; filter does not apply
    const statement = makeStatement("Rabobank", "mortgage", "Nummer192658069", {
      mortgage: { interestPaid: 8400, remainingDebt: 0 },
    });
    const result = categorize(
      makeMatchResult({ onlyInJaaropgave: [{ statement, account: statement.accounts[0] }] })
    );
    expect(result.notFilledIn).toHaveLength(1);
  });
});
