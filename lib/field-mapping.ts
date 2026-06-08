import type { AccountAmounts } from "./types";

// Maps aangifte field name fragments (lowercase) to jaaropgave amount paths.
// negate: true → jaaropgave stores a positive value but aangifte is negative (deductions).
// Sorted longest-first so more-specific substrings always win over shorter ones (structural invariant).
export const FIELD_AMOUNT_OVERRIDES: Array<{
  fieldIncludes: string;
  amountPath: readonly [keyof AccountAmounts, string];
  negate?: boolean;
}> = [
  {
    fieldIncludes: "ingehouden dividendbelasting",
    amountPath: ["broker", "dutchDividendTax"] as const,
  },
  { fieldIncludes: "dividendbelasting", amountPath: ["broker", "dutchDividendTax"] as const },
  {
    fieldIncludes: "buitenlandse bronbelasting",
    amountPath: ["broker", "foreignWithholdingTax"] as const,
  },
  { fieldIncludes: "bronheffing", amountPath: ["broker", "foreignWithholdingTax"] as const },
  { fieldIncludes: "brutodividend", amountPath: ["broker", "dividend"] as const },
  { fieldIncludes: "loon", amountPath: ["wage", "taxableWage"] as const },
  { fieldIncludes: "inkomsten uit werk", amountPath: ["wage", "taxableWage"] as const },
  {
    fieldIncludes: "arbeidsongeschiktheid",
    amountPath: ["other", "premiumPaid"] as const,
    negate: true,
  },
  { fieldIncludes: "rente", amountPath: ["mortgage", "interestPaid"] as const, negate: true },
  { fieldIncludes: "dividend", amountPath: ["broker", "dividend"] as const },
].sort((a, b) => b.fieldIncludes.length - a.fieldIncludes.length);

export function resolveAmountOverride(fieldLower: string, amounts: AccountAmounts): number | null {
  for (const { fieldIncludes, amountPath, negate } of FIELD_AMOUNT_OVERRIDES) {
    if (!fieldLower.includes(fieldIncludes)) continue;
    const val = amounts[amountPath[0]]?.[amountPath[1]];
    if (val == null) continue;
    return negate ? -val : val;
  }
  return null;
}
