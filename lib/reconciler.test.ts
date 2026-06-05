import { describe, expect, it } from "vitest";
import { reconcile } from "./reconciler";
import type { AnnualStatementData, TaxReturnData } from "./types";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function taxReturn(entries: TaxReturnData["entries"]): TaxReturnData {
  return { taxYear: 2025, entries };
}

function entry(
  field: string,
  amount: number,
  accountNumber: string | null = null,
  box: "1" | "2" | "3" = "3"
): TaxReturnData["entries"][number] {
  return { box, field, accountNumber, amount };
}

function statement(
  accountNumber: string,
  amounts: Record<string, Record<string, number>> = { bank: { balance: 0 } }
): AnnualStatementData {
  return {
    institution: "Test",
    institutionType: "other",
    taxYear: 2025,
    metadata: {},
    accounts: [{ accountNumber, description: "Test", amounts }],
  };
}

// ─── Primary matching ───────────────────────────────────────────────────────

describe("reconcile — primary match by rekeningnummer", () => {
  it("matches despite formatting differences", () => {
    const result = reconcile(taxReturn([entry("Saldo", 0, "Nummer 1926.58.069")]), [
      statement("1926.58.069"),
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("places aangifte entry with null accountNumber in onlyInAangifte", () => {
    const result = reconcile(taxReturn([entry("Saldo", 0, null)]), [
      statement("NL00INGB0000000001", { bank: { balance: 5000 } }),
    ]);
    expect(result.matched).toHaveLength(0);
    expect(result.onlyInAangifte).toHaveLength(1);
    expect(result.onlyInJaaropgave).toHaveLength(1);
  });

  it("places unmatched aangifte entry in onlyInAangifte", () => {
    const result = reconcile(taxReturn([entry("Saldo", 0, "NL99TEST0000000000")]), [
      statement("NL00INGB0000000001", { bank: { balance: 5000 } }),
    ]);
    expect(result.onlyInAangifte).toHaveLength(1);
    expect(result.onlyInJaaropgave).toHaveLength(1);
  });

  it("places unmatched jaaropgave account in onlyInJaaropgave", () => {
    const result = reconcile(taxReturn([]), [
      statement("NL00INGB0000000001", { bank: { balance: 5000 } }),
    ]);
    expect(result.onlyInJaaropgave).toHaveLength(1);
    expect(result.onlyInJaaropgave[0].account.accountNumber).toBe("NL00INGB0000000001");
  });

  it("multiple aangifte entries can match the same jaaropgave account", () => {
    const result = reconcile(
      taxReturn([
        entry("Aftrekbare rente", -1618, "3118962968", "1"),
        entry("Restschuld", -73000, "3118962968", "1"),
      ]),
      [statement("3118.962.968")]
    );
    expect(result.matched).toHaveLength(2);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("matches aangifte entry to jaaropgave account by account number", () => {
    const result = reconcile(taxReturn([entry("Saldo", 3080, "NL00INGB0000000001")]), [
      statement("NL00INGB0000000001"),
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].aangifte.accountNumber).toBe("NL00INGB0000000001");
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });
});

// ─── Calculated field removal ───────────────────────────────────────────────

describe("reconcile — calculated field removal", () => {
  it("removes Eigenwoningforfait from onlyInAangifte", () => {
    const result = reconcile(taxReturn([entry("Eigenwoningforfait", 1848)]), []);
    expect(result.onlyInAangifte).toHaveLength(0);
  });

  it("removes Eigenwoning-forfait (hyphenated) from onlyInAangifte", () => {
    const result = reconcile(taxReturn([entry("Eigenwoning-forfait", 1848)]), []);
    expect(result.onlyInAangifte).toHaveLength(0);
  });

  it("leaves non-calculated entries in onlyInAangifte when no match found", () => {
    const result = reconcile(taxReturn([entry("Loon in Nederland", 100932, null, "1")]), []);
    expect(result.onlyInAangifte).toHaveLength(1);
  });
});

// ─── Secondary matching ─────────────────────────────────────────────────────

describe("reconcile — secondary match by amount", () => {
  it("amount-matches a Loon entry to a wage jaaropgave and moves to matched", () => {
    const result = reconcile(taxReturn([entry("Loon in Nederland", 100932, null, "1")]), [
      statement("employer-001", { wage: { taxableWage: 100932 } }),
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("amount-matches an AO premium entry to an insurance jaaropgave", () => {
    const result = reconcile(
      taxReturn([
        entry("Aftrekbare premies voor een arbeidsongeschiktheidsverzekering", -940, null, "1"),
      ]),
      [statement("insurance-001", { other: { premiumPaid: 940 } })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
  });

  it("amount-matches 'Inkomsten uit werk' (section header) to a wage jaaropgave", () => {
    const result = reconcile(taxReturn([entry("Inkomsten uit werk", 100932, null, "1")]), [
      statement("employer-001", { wage: { taxableWage: 100932 } }),
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("secondary-matches a Loon entry even when accountNumber is not null", () => {
    const result = reconcile(taxReturn([entry("Loon in Nederland", 100932, "135689600", "1")]), [
      statement("employer-001", { wage: { taxableWage: 100932 } }),
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
  });

  it("does NOT match when amounts differ by more than €1", () => {
    const result = reconcile(taxReturn([entry("Loon in Nederland", 100932, null, "1")]), [
      statement("employer-001", { wage: { taxableWage: 100000 } }),
    ]);
    expect(result.matched).toHaveLength(0);
    expect(result.onlyInAangifte).toHaveLength(1);
  });

  it("does NOT match when no suitable jaaropgave exists", () => {
    const result = reconcile(taxReturn([entry("Loon in Nederland", 100932, null, "1")]), []);
    expect(result.matched).toHaveLength(0);
    expect(result.onlyInAangifte).toHaveLength(1);
  });

  it("matched pair from secondary matching contains both aangifte and jaaropgave sides", () => {
    const result = reconcile(taxReturn([entry("Loon in Nederland", 100932, null, "1")]), [
      statement("employer-001", { wage: { taxableWage: 100932 } }),
    ]);
    expect(result.matched[0].aangifte.field).toBe("Loon in Nederland");
    expect(result.matched[0].jaaropgave.account.amounts["wage"]?.["taxableWage"]).toBe(100932);
  });

  it("amount-matches a Loon entry when wage is stored in bank.wage (old extraction schema)", () => {
    const result = reconcile(taxReturn([entry("Loon in Nederland", 100932, null, "1")]), [
      statement("employer-001", { bank: { wage: 100932 } }),
    ]);
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("amount-matches DEGIRO Beleggingsrekening to a masked jaaropgave account via broker.balance", () => {
    const result = reconcile(
      taxReturn([entry("DEGIRO Beleggingsrekening", 47848, "rpbaptist")]),
      [statement("******ist", { bank: { balance: 92 }, broker: { balance: 47849 } })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });
});

// ─── IBAN suffix matching ────────────────────────────────────────────────────

describe("reconcile — IBAN suffix matching", () => {
  it("matches when aangifte has trailing digits of a full IBAN", () => {
    const result = reconcile(
      taxReturn([entry("flatexDEGIRO Bank AG", 92, "0532013000")]),
      [statement("DE89370400440532013000", { bank: { balance: 92 } })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("matches when aangifte has formatted trailing digits (spaces stripped by normalizer)", () => {
    const result = reconcile(
      taxReturn([entry("flatexDEGIRO Bank AG", 92, "0532 0130 00")]),
      [statement("DE89370400440532013000", { bank: { balance: 92 } })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.onlyInAangifte).toHaveLength(0);
    expect(result.onlyInJaaropgave).toHaveLength(0);
  });

  it("does NOT suffix-match short account codes (< 8 chars after normalisation)", () => {
    const result = reconcile(
      taxReturn([entry("Some account", 0, "12345")]),
      [statement("NL00INGB0012345678", { bank: { balance: 0 } })]
    );
    expect(result.matched).toHaveLength(0);
  });
});
