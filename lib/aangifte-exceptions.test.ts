import { describe, expect, it } from "vitest";
import { applyExceptions } from "./aangifte-exceptions";
import type { MatchedPair, UnmatchedJaaropgave } from "./account-matcher";
import type { TaxReturnEntry, AnnualStatementData } from "./types";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function aangifte(field: string, amount: number, accountNumber: string | null = null): TaxReturnEntry {
  return { box: "1", field, accountNumber, amount };
}

function statement(amounts: Record<string, Record<string, number>>): UnmatchedJaaropgave {
  return {
    statement: {
      institution: "Test",
      institutionType: "other",
      taxYear: 2025,
      accounts: [],
      metadata: {},
    } as AnnualStatementData,
    account: { accountNumber: "test", description: "Test", amounts },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("applyExceptions", () => {
  it("removes Eigenwoningforfait from onlyInAangifte", () => {
    const { onlyInAangifte } = applyExceptions([], [aangifte("Eigenwoningforfait", 1848)], []);
    expect(onlyInAangifte).toHaveLength(0);
  });

  it("removes Eigenwoning-forfait (hyphenated) from onlyInAangifte", () => {
    const { onlyInAangifte } = applyExceptions([], [aangifte("Eigenwoning-forfait", 1848)], []);
    expect(onlyInAangifte).toHaveLength(0);
  });

  it("leaves non-calculated entries in onlyInAangifte", () => {
    const { onlyInAangifte } = applyExceptions([], [aangifte("Loon in Nederland", 100932, null)], []);
    // Loon has no jaaropgave to match here, so stays in onlyInAangifte
    expect(onlyInAangifte).toHaveLength(1);
  });

  it("amount-matches a Loon entry to a wage jaaropgave and moves to matched", () => {
    const loon = aangifte("Loon in Nederland", 100932, null);
    const wage = statement({ wage: { taxableWage: 100932 } });
    const { matched, onlyInAangifte, onlyInJaaropgave } = applyExceptions([], [loon], [wage]);
    expect(matched).toHaveLength(1);
    expect(onlyInAangifte).toHaveLength(0);
    expect(onlyInJaaropgave).toHaveLength(0);
  });

  it("amount-matches an AO premium entry to an insurance jaaropgave", () => {
    const ao = aangifte("Aftrekbare premies voor een arbeidsongeschiktheidsverzekering", -940, null);
    const insurance = statement({ other: { premiumPaid: 940 } });
    const { matched, onlyInAangifte } = applyExceptions([], [ao], [insurance]);
    expect(matched).toHaveLength(1);
    expect(onlyInAangifte).toHaveLength(0);
  });

  it("secondary-matches a Loon entry even when accountNumber is not null", () => {
    const loon = aangifte("Loon in Nederland", 100932, "135689600"); // loonheffingsnummer
    const wage = statement({ wage: { taxableWage: 100932 } });
    const { matched, onlyInAangifte } = applyExceptions([], [loon], [wage]);
    expect(matched).toHaveLength(1);
    expect(onlyInAangifte).toHaveLength(0);
  });

  it("does NOT match when amounts differ by more than €1", () => {
    const loon = aangifte("Loon in Nederland", 100932, null);
    const wage = statement({ wage: { taxableWage: 100000 } }); // €932 off
    const { matched, onlyInAangifte } = applyExceptions([], [loon], [wage]);
    expect(matched).toHaveLength(0);
    expect(onlyInAangifte).toHaveLength(1);
  });

  it("does NOT match when no suitable jaaropgave exists in the unmatched list", () => {
    const loon = aangifte("Loon in Nederland", 100932, null);
    const { matched, onlyInAangifte } = applyExceptions([], [loon], []);
    expect(matched).toHaveLength(0);
    expect(onlyInAangifte).toHaveLength(1);
  });

  it("matched pair from secondary matching contains both aangifte and jaaropgave sides", () => {
    const loon = aangifte("Loon in Nederland", 100932, null);
    const wage = statement({ wage: { taxableWage: 100932 } });
    const { matched } = applyExceptions([], [loon], [wage]);
    expect(matched[0].aangifte.field).toBe("Loon in Nederland");
    expect(matched[0].jaaropgave.account.amounts["wage"]?.["taxableWage"]).toBe(100932);
  });
});
