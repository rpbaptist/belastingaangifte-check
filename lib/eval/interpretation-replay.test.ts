import { describe, expect, it } from "vitest";
import { buildReport } from "@/lib/report";
import type { ExtractedData } from "@/lib/types";
import { summarizeReport, withoutKnownWrong } from "./interpretation";
import { listScenarios, loadScenario } from "./interpretation-scenario";

// Interpretation fixture replay (#104). Replays one coherent taxpayer through the
// deterministic report seam and compares every row, amount and count against expected.json.
// Per-module tests did not catch #99 (a lost row) because nothing compared how many rows went
// in with how many came out; this suite does.

function replay(input: ExtractedData) {
  return summarizeReport(
    buildReport(
      input.taxReturn,
      input.annualStatements,
      input.propertyStatements,
      input.unrecognizedDocuments,
      "nl"
    )
  );
}

describe.each(listScenarios())("Interpretation fixture %s", (name) => {
  it("replays to the recorded report summary", () => {
    const { input, expected } = loadScenario(name);
    expect(replay(input)).toEqual(withoutKnownWrong(expected));
  });
});

// One labelled input row per aangifte entry, jaaropgave account and property statement, and
// the same input with that row removed.
function withEachRowRemoved(input: ExtractedData): { label: string; input: ExtractedData }[] {
  const variants: { label: string; input: ExtractedData }[] = [];

  input.taxReturn.entries.forEach((entry, i) => {
    variants.push({
      label: `aangifte: ${entry.field} ${entry.amount}`,
      input: {
        ...input,
        taxReturn: {
          ...input.taxReturn,
          entries: input.taxReturn.entries.filter((_, j) => j !== i),
        },
      },
    });
  });

  input.annualStatements.forEach((statement, s) => {
    statement.accounts.forEach((account, a) => {
      variants.push({
        label: `jaaropgave: ${statement.institution} ${account.accountNumber}`,
        input: {
          ...input,
          annualStatements: input.annualStatements.map((st, t) =>
            t === s ? { ...st, accounts: st.accounts.filter((_, b) => b !== a) } : st
          ),
        },
      });
    });
  });

  input.propertyStatements.forEach((statement, p) => {
    variants.push({
      label: `${statement.documentKind}: ${statement.institution}`,
      input: {
        ...input,
        propertyStatements: input.propertyStatements.filter((_, q) => q !== p),
      },
    });
  });

  return variants;
}

describe("Interpretation fixture aangifte-2023", () => {
  const { input } = loadScenario("aangifte-2023");
  const baseline = replay(input);

  // Input rows the report is designed not to show. Removing one of these changes nothing, so
  // the fixture cannot detect its loss; every other row must be visible.
  const invisibleByDesign = new Set([
    // Calculated by the Belastingdienst; no jaaropgave is ever issued (CALCULATED_FIELDS).
    "aangifte: Eigenwoningforfait 2650",
    // Repaid mid-year via the home sale; suppressed from notFilledIn (isMidYearClosedMortgage).
    "jaaropgave: ABN AMRO 5372441180",
    // The joint account's second copy. The first copy (partner A) matches the aangifte row,
    // so the second adds no row; removing both copies is visible (asserted below).
    "jaaropgave: ING NL22 INGB 0673 3457 85",
  ]);

  it.each(withEachRowRemoved(input))("fails the replay when $label is removed", (variant) => {
    if (invisibleByDesign.has(variant.label)) {
      expect(replay(variant.input)).toEqual(baseline);
    } else {
      expect(replay(variant.input)).not.toEqual(baseline);
    }
  });

  it("names only input rows that exist in the scenario as invisible by design", () => {
    const labels = new Set(withEachRowRemoved(input).map((v) => v.label));
    expect([...invisibleByDesign].filter((label) => !labels.has(label))).toEqual([]);
  });

  // The #99 shape: a row that reconciles correctly must survive categorization.
  it("keeps both components of one account as two covered rows", () => {
    const asn = baseline.covered.rows.filter((r) => r.field === "ASN Themabeleggen");
    expect(asn.map((r) => r.amountTaxReturn).sort((a, b) => a - b)).toEqual([2140, 17630]);
    expect(baseline.findings.byKind.duplicateRow).toBeUndefined();
  });

  it("covers a joint account in two jaaropgaves once, and loses it when both are gone", () => {
    const isIng = (accountNumber: string) =>
      accountNumber.replace(/\s/g, "") === "NL22INGB0673345785";
    expect(baseline.covered.rows.filter((r) => isIng(r.accountNumber))).toHaveLength(1);
    expect(baseline.notFilledIn.rows.filter((r) => isIng(r.accountNumber))).toHaveLength(0);

    const withoutIng = replay({
      ...input,
      annualStatements: input.annualStatements.filter(
        (s) => !s.accounts.some((a) => isIng(a.accountNumber))
      ),
    });
    expect(withoutIng.covered.count).toBe(baseline.covered.count - 1);
    expect(withoutIng.missingStatement.count).toBe(baseline.missingStatement.count + 1);
  });
});
