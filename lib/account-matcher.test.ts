import { describe, expect, it } from "vitest";
import { matchEntries } from "./account-matcher";
import type { AccountData, AnnualStatementData, TaxReturnData } from "./types";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function taxReturn(entries: TaxReturnData["entries"]): TaxReturnData {
  return { taxYear: 2025, entries };
}

function entry(
  accountNumber: string | null,
  amount = 0,
  field = "Saldo",
  box: "1" | "2" | "3" = "3"
): TaxReturnData["entries"][number] {
  return { box, field, accountNumber, amount };
}

function statement(...accountNumbers: string[]): AnnualStatementData {
  return {
    institution: "Test",
    institutionType: "bank",
    taxYear: 2025,
    metadata: {},
    accounts: accountNumbers.map((n) => account(n)),
  };
}

function account(accountNumber: string): AccountData {
  return { accountNumber, description: "Test", amounts: {} };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("matchEntries", () => {
  it("matches despite formatting differences", () => {
    const result = matchEntries(
      taxReturn([entry("Nummer 1926.58.069")]),
      [statement("1926.58.069")]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("places aangifte entry with null accountNumber in onlyInAangifte", () => {
    const result = matchEntries(
      taxReturn([entry(null)]),
      [statement("NL00INGB0000000001")]
    );
    expect(result.matched).toHaveLength(0);
    expect(result.onlyInAangifte).toHaveLength(1);
    expect(result.onlyInJaaropgave).toHaveLength(1);
  });

  it("places unmatched aangifte entry in onlyInAangifte", () => {
    const result = matchEntries(
      taxReturn([entry("NL99TEST0000000000")]),
      [statement("NL00INGB0000000001")]
    );
    expect(result.onlyInAangifte).toHaveLength(1);
    expect(result.onlyInJaaropgave).toHaveLength(1);
  });

  it("places unmatched jaaropgave account in onlyInJaaropgave", () => {
    const result = matchEntries(
      taxReturn([]),
      [statement("NL00INGB0000000001")]
    );
    expect(result.onlyInJaaropgave).toHaveLength(1);
    expect(result.onlyInJaaropgave[0].account.accountNumber).toBe("NL00INGB0000000001");
  });

  it("multiple aangifte entries can match the same jaaropgave account", () => {
    const result = matchEntries(
      taxReturn([
        entry("3118962968", -1618, "Aftrekbare rente", "1"),
        entry("3118962968", -73000, "Restschuld", "1"),
      ]),
      [statement("3118.962.968")]
    );
    expect(result.matched).toHaveLength(2);
    expect(result.onlyInAangifte).toHaveLength(0);
    // the jaaropgave account appeared in a match, so not in onlyInJaaropgave
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("matches aangifte entry to jaaropgave account by account number", () => {
    const result = matchEntries(
      taxReturn([entry("NL00INGB0000000001", 3080)]),
      [statement("NL00INGB0000000001")]
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].aangifte.accountNumber).toBe("NL00INGB0000000001");
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });
});
