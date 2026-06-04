import { describe, expect, it } from "vitest";
import { buildMissingStatement, buildNotFilledIn } from "./report-builder";
import type { UnmatchedJaaropgave } from "./account-matcher";
import type { AnnualStatementData, TaxReturnEntry } from "./types";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function entry(
  field: string,
  amount: number,
  accountNumber: string | null = "NL00TEST0000000001",
  box: "1" | "2" | "3" = "3"
): TaxReturnEntry {
  return { box, field, accountNumber, amount };
}

function unmatched(
  accountNumber: string,
  amounts: Record<string, Record<string, number>>,
  institution = "Test Bank"
): UnmatchedJaaropgave {
  return {
    statement: {
      institution,
      institutionType: "bank",
      taxYear: 2025,
      accounts: [],
      metadata: {},
    } as AnnualStatementData,
    account: { accountNumber, description: "Testrekening", amounts },
  };
}

// ─── buildMissingStatement ─────────────────────────────────────────────────

describe("buildMissingStatement", () => {
  it("maps entries 1:1, preserving all fields", () => {
    const items = buildMissingStatement([
      entry("Saldo bank en spaarrekeningen", 12345, "NL00INGB0000000001", "3"),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      field: "Saldo bank en spaarrekeningen",
      accountNumber: "NL00INGB0000000001",
      amount: 12345,
      box: "3",
    });
  });

  it("preserves null accountNumber", () => {
    const items = buildMissingStatement([entry("Loon in Nederland", 100932, null, "1")]);
    expect(items[0].accountNumber).toBeNull();
  });

  it("returns empty array for empty input", () => {
    expect(buildMissingStatement([])).toHaveLength(0);
  });
});

// ─── buildNotFilledIn ──────────────────────────────────────────────────────

describe("buildNotFilledIn", () => {
  it("filters zero-balance accounts", () => {
    const items = buildNotFilledIn([unmatched("NL00INGB0000000001", { bank: { balance: 0 } })]);
    expect(items).toHaveLength(0);
  });

  it("uses bank.balance as primary amount", () => {
    const items = buildNotFilledIn([unmatched("NL00INGB0000000001", { bank: { balance: 5000 } })]);
    expect(items[0].amount).toBe(5000);
  });

  it("sums bank.balance and broker.balance for dual-component accounts", () => {
    const items = buildNotFilledIn([
      unmatched("1019345793", { bank: { balance: 92 }, broker: { balance: 47848 } }),
    ]);
    expect(items[0].amount).toBe(47940);
  });

  it("uses mortgage.interestPaid when no balance fields", () => {
    const items = buildNotFilledIn([
      unmatched("Nummer192658069", { mortgage: { interestPaid: 3200, remainingDebt: 180000 } }),
    ]);
    expect(items[0].amount).toBe(3200);
  });

  it("uses wage.taxableWage for employer accounts", () => {
    const items = buildNotFilledIn([
      unmatched("135689600", { wage: { taxableWage: 100932 } }),
    ]);
    expect(items[0].amount).toBe(100932);
  });

  it("preserves institution, accountNumber, description", () => {
    const items = buildNotFilledIn([unmatched("NL00RABO0000000001", { bank: { balance: 1000 } }, "Rabobank")]);
    expect(items[0].institution).toBe("Rabobank");
    expect(items[0].accountNumber).toBe("NL00RABO0000000001");
    expect(items[0].description).toBe("Testrekening");
  });
});
