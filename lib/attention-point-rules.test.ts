import { describe, expect, test } from "vitest";
import { buildDeterministicAttentionPoints } from "./attention-point-rules";
import type { MatchedPair } from "./account-matcher";
import type { AccountData, AnnualStatementData, TaxReturnEntry, UnmatchedJaaropgave } from "./types";

function makeStatement(overrides: Partial<AnnualStatementData> = {}): AnnualStatementData {
  return {
    institution: "Test Bank",
    institutionType: "bank",
    taxYear: 2024,
    accounts: [],
    metadata: {},
    ...overrides,
  };
}

function makeAccount(amounts: AccountData["amounts"], accountNumber = "NL01TEST001"): AccountData {
  return { accountNumber, description: "test", amounts };
}

function makeMatchedPair(statement: AnnualStatementData, account: AccountData): MatchedPair {
  const aangifte: TaxReturnEntry = { box: "3", field: "test", accountNumber: account.accountNumber, amount: 1000 };
  return { aangifte, jaaropgave: { statement, account } };
}

describe("buildDeterministicAttentionPoints", () => {
  describe("Aflossingsvrij hypotheek", () => {
    test("fires when mortgageType is aflossingsvrij", () => {
      const statement = makeStatement({ institutionType: "mortgage", metadata: { mortgageType: "aflossingsvrij" } });
      const pair = makeMatchedPair(statement, makeAccount({ mortgage: { interestPaid: 3000 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(true);
    });

    test("does not fire for annuïteit", () => {
      const statement = makeStatement({ institutionType: "mortgage", metadata: { mortgageType: "annuïteit" } });
      const pair = makeMatchedPair(statement, makeAccount({ mortgage: { interestPaid: 3000 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(false);
    });

    test("deduplicates — two accounts from same statement emit one attention point", () => {
      const statement = makeStatement({ institutionType: "mortgage", metadata: { mortgageType: "aflossingsvrij" } });
      const pair1 = makeMatchedPair(statement, makeAccount({ mortgage: { interestPaid: 2000 } }, "NL01TEST001"));
      const pair2 = makeMatchedPair(statement, makeAccount({ mortgage: { interestPaid: 1000 } }, "NL01TEST002"));
      const result = buildDeterministicAttentionPoints([pair1, pair2], [], 2024);
      expect(result.filter((p) => p.title === "Aflossingsvrij hypotheek")).toHaveLength(1);
    });

    test("fires when in onlyInJaaropgave", () => {
      const statement = makeStatement({ institutionType: "mortgage", metadata: { mortgageType: "aflossingsvrij" } });
      const unmatched: UnmatchedJaaropgave = { statement, account: makeAccount({ mortgage: { interestPaid: 3000 } }) };
      const result = buildDeterministicAttentionPoints([], [unmatched], 2024);
      expect(result.some((p) => p.title === "Aflossingsvrij hypotheek")).toBe(true);
    });
  });

  describe("Buitenlands dividend", () => {
    test("fires on foreignDividend > 0", () => {
      const statement = makeStatement({ institutionType: "broker" });
      const pair = makeMatchedPair(statement, makeAccount({ broker: { balance: 10000, foreignDividend: 150 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Buitenlands dividend")).toBe(true);
    });

    test("fires on foreignWithholdingTax > 0", () => {
      const statement = makeStatement({ institutionType: "broker" });
      const pair = makeMatchedPair(statement, makeAccount({ broker: { balance: 10000, foreignWithholdingTax: 30 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Buitenlands dividend")).toBe(true);
    });

    test("does NOT fire on dutchDividendTax alone", () => {
      const statement = makeStatement({ institutionType: "broker" });
      const pair = makeMatchedPair(statement, makeAccount({ broker: { balance: 10000, dutchDividendTax: 75 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Buitenlands dividend")).toBe(false);
    });

    test("fires when in onlyInJaaropgave", () => {
      const statement = makeStatement({ institutionType: "broker" });
      const unmatched: UnmatchedJaaropgave = { statement, account: makeAccount({ broker: { foreignDividend: 50 } }) };
      const result = buildDeterministicAttentionPoints([], [unmatched], 2024);
      expect(result.some((p) => p.title === "Buitenlands dividend")).toBe(true);
    });
  });

  describe("Saldo boven vrijstelling", () => {
    test("fires when total exceeds 57000", () => {
      const statement = makeStatement({ institutionType: "bank" });
      const pair = makeMatchedPair(statement, makeAccount({ bank: { balance: 58000 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Saldo boven vrijstelling")).toBe(true);
    });

    test("does not fire at exactly 57000", () => {
      const statement = makeStatement({ institutionType: "bank" });
      const pair = makeMatchedPair(statement, makeAccount({ bank: { balance: 57000 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Saldo boven vrijstelling")).toBe(false);
    });

    test("sums across matched and unmatched accounts", () => {
      const statement = makeStatement({ institutionType: "bank" });
      const pair = makeMatchedPair(statement, makeAccount({ bank: { balance: 30000 } }, "NL01TEST001"));
      const unmatched: UnmatchedJaaropgave = { statement, account: makeAccount({ bank: { balance: 30000 } }, "NL01TEST002") };
      const result = buildDeterministicAttentionPoints([pair], [unmatched], 2024);
      expect(result.some((p) => p.title === "Saldo boven vrijstelling")).toBe(true);
    });

    test("sums bank and broker balances", () => {
      const statement = makeStatement({ institutionType: "broker" });
      const pair = makeMatchedPair(statement, makeAccount({ bank: { balance: 30000 }, broker: { balance: 30000 } }));
      const result = buildDeterministicAttentionPoints([pair], [], 2024);
      expect(result.some((p) => p.title === "Saldo boven vrijstelling")).toBe(true);
    });

    test("threshold is parameterised by tax year", () => {
      const statement = makeStatement({ institutionType: "bank" });
      const pair = makeMatchedPair(statement, makeAccount({ bank: { balance: 58000 } }));
      // Both 2024 and 2025 currently use 57000
      expect(buildDeterministicAttentionPoints([pair], [], 2024).some((p) => p.title === "Saldo boven vrijstelling")).toBe(true);
      expect(buildDeterministicAttentionPoints([pair], [], 2025).some((p) => p.title === "Saldo boven vrijstelling")).toBe(true);
    });
  });
});
