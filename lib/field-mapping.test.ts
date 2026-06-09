import { describe, expect, it } from "vitest";
import { resolveAmountOverride } from "./field-mapping";
import type { AccountAmounts } from "./types";

const amounts: AccountAmounts = {
  bank: { balance: 5000 },
  broker: { balance: 10000, dutchDividendTax: 75, foreignWithholdingTax: 30, dividend: 500 },
  wage: { taxableWage: 60000 },
  mortgage: { interestPaid: 8400, remainingDebt: 200000 },
  other: { premiumPaid: 940 },
};

describe("resolveAmountOverride", () => {
  it("maps 'loon' to wage.taxableWage", () => {
    expect(resolveAmountOverride("loon in nederland", amounts)).toBe(60000);
  });

  it("maps 'inkomsten uit werk' to wage.taxableWage", () => {
    expect(resolveAmountOverride("inkomsten uit werk", amounts)).toBe(60000);
  });

  it("maps 'rente' to mortgage.interestPaid negated", () => {
    expect(resolveAmountOverride("aftrekbare rente van schuld", amounts)).toBe(-8400);
  });

  it("maps 'arbeidsongeschiktheid' to other.premiumPaid negated", () => {
    expect(
      resolveAmountOverride("premies voor een arbeidsongeschiktheidsverzekering", amounts)
    ).toBe(-940);
  });

  it("maps 'ingehouden dividendbelasting' to broker.dutchDividendTax (longer key wins over 'dividendbelasting')", () => {
    expect(resolveAmountOverride("ingehouden dividendbelasting", amounts)).toBe(75);
  });

  it("maps 'buitenlandse bronbelasting' to broker.foreignWithholdingTax", () => {
    expect(resolveAmountOverride("verrekenbare buitenlandse bronbelasting", amounts)).toBe(30);
  });

  it("maps 'bronheffing' to broker.foreignWithholdingTax", () => {
    expect(resolveAmountOverride("buitenlandse bronheffing", amounts)).toBe(30);
  });

  it("returns null when no field matches", () => {
    expect(resolveAmountOverride("overige inkomsten", amounts)).toBeNull();
  });

  it("returns null when the matched path is absent from amounts", () => {
    expect(resolveAmountOverride("loon in nederland", { bank: { balance: 0 } })).toBeNull();
  });
});
