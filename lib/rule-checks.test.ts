import { describe, expect, it } from "vitest";
import { runRuleChecks } from "./rule-checks";
import type { AnnualStatementData } from "./types";

function makeStatement(
  overrides: Partial<AnnualStatementData> & { amounts?: Record<string, Record<string, number>> }
): AnnualStatementData {
  const { amounts, ...rest } = overrides;
  return {
    institution: "Test",
    institutionType: "bank",
    taxYear: 2024,
    metadata: {},
    accounts: [
      {
        accountNumber: "NL00TEST0000000001",
        description: "Test",
        amounts: amounts ?? { bank: { balance: 1000 } },
      },
    ],
    ...rest,
  };
}

describe("runRuleChecks — aflossingsvrij hypotheek", () => {
  it("flags with Dutch title when language is 'nl'", () => {
    const statement = makeStatement({
      institutionType: "mortgage",
      metadata: { mortgageType: "aflossingsvrij" },
      amounts: { mortgage: { interestPaid: 8400, remainingDebt: 200000 } },
    });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(true);
  });

  it("flags with English title when language is 'en'", () => {
    const statement = makeStatement({
      institutionType: "mortgage",
      metadata: { mortgageType: "aflossingsvrij" },
      amounts: { mortgage: { interestPaid: 8400, remainingDebt: 200000 } },
    });
    const points = runRuleChecks([statement], 2024, "en");
    expect(points.some((p) => p.title === "Interest-only mortgage")).toBe(true);
  });

  it("does not flag when mortgageType is annuïteit", () => {
    const statement = makeStatement({
      institutionType: "mortgage",
      metadata: { mortgageType: "annuïteit" },
      amounts: { mortgage: { interestPaid: 8400, remainingDebt: 200000 } },
    });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(false);
  });

  it("does not flag when metadata is empty", () => {
    const statement = makeStatement({ institutionType: "mortgage", metadata: {} });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(false);
  });
});

describe("runRuleChecks — buitenlands dividend", () => {
  it("flags with Dutch title when language is 'nl'", () => {
    const statement = makeStatement({
      institutionType: "broker",
      amounts: { broker: { balance: 10000, foreignDividend: 200, foreignWithholdingTax: 0 } },
    });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Buitenlands dividend")).toBe(true);
  });

  it("flags with English title when language is 'en'", () => {
    const statement = makeStatement({
      institutionType: "broker",
      amounts: { broker: { balance: 10000, foreignDividend: 200, foreignWithholdingTax: 0 } },
    });
    const points = runRuleChecks([statement], 2024, "en");
    expect(points.some((p) => p.title === "Foreign dividend")).toBe(true);
  });

  it("flags when foreignWithholdingTax > 0", () => {
    const statement = makeStatement({
      institutionType: "broker",
      amounts: { broker: { balance: 10000, foreignWithholdingTax: 30 } },
    });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Buitenlands dividend")).toBe(true);
  });

  it("does not flag when only dutchDividendTax is present", () => {
    const statement = makeStatement({
      institutionType: "broker",
      amounts: { broker: { balance: 10000, dutchDividendTax: 75, dividend: 500 } },
    });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Buitenlands dividend")).toBe(false);
  });

  it("does not flag when all broker dividend amounts are zero", () => {
    const statement = makeStatement({
      institutionType: "broker",
      amounts: { broker: { balance: 10000, foreignDividend: 0, foreignWithholdingTax: 0 } },
    });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Buitenlands dividend")).toBe(false);
  });
});

describe("runRuleChecks — saldo boven heffingsvrij vermogen", () => {
  it("flags with Dutch title when language is 'nl'", () => {
    const statement = makeStatement({ amounts: { bank: { balance: 60000 } } });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Vermogen boven heffingsvrij vermogen")).toBe(true);
  });

  it("flags with English title when language is 'en'", () => {
    const statement = makeStatement({ amounts: { bank: { balance: 60000 } } });
    const points = runRuleChecks([statement], 2024, "en");
    expect(points.some((p) => p.title === "Assets above tax-free threshold")).toBe(true);
  });

  it("does not flag when total box 3 assets are below threshold", () => {
    const statement = makeStatement({ amounts: { bank: { balance: 30000 } } });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Vermogen boven heffingsvrij vermogen")).toBe(false);
  });

  it("sums bank and broker balances across multiple accounts", () => {
    const s1 = makeStatement({ amounts: { bank: { balance: 40000 } } });
    const s2 = makeStatement({ amounts: { broker: { balance: 20000 } } });
    const points = runRuleChecks([s1, s2], 2024);
    expect(points.some((p) => p.title === "Vermogen boven heffingsvrij vermogen")).toBe(true);
  });

  it("excludes negative balances (debt) from the total", () => {
    const s1 = makeStatement({ amounts: { bank: { balance: 60000 } } });
    const s2 = makeStatement({ amounts: { bank: { balance: -5000 } } }); // credit card debt
    const points = runRuleChecks([s1, s2], 2024);
    // 60000 + max(0, -5000) = 60000 > 57000 → still flags
    expect(points.some((p) => p.title === "Vermogen boven heffingsvrij vermogen")).toBe(true);
  });

  it("does not flag when total is at the threshold exactly (not above)", () => {
    const statement = makeStatement({ amounts: { bank: { balance: 57000 } } });
    const points = runRuleChecks([statement], 2024);
    expect(points.some((p) => p.title === "Vermogen boven heffingsvrij vermogen")).toBe(false);
  });

  it("uses correct threshold for 2022", () => {
    const statement = makeStatement({ amounts: { bank: { balance: 51000 } } });
    const points = runRuleChecks([statement], 2022);
    expect(points.some((p) => p.title === "Vermogen boven heffingsvrij vermogen")).toBe(true);
  });

  it("does not flag when below 2022 threshold", () => {
    const statement = makeStatement({ amounts: { bank: { balance: 50000 } } });
    const points = runRuleChecks([statement], 2022);
    expect(points.some((p) => p.title === "Vermogen boven heffingsvrij vermogen")).toBe(false);
  });
});

describe("runRuleChecks — no false positives for empty statements", () => {
  it("returns no points for an empty statements list", () => {
    expect(runRuleChecks([], 2024)).toHaveLength(0);
  });
});
