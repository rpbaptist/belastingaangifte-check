import type { MatchedPair, UnmatchedJaaropgave } from "./account-matcher";
import type { AccountData, TaxReturnEntry } from "./types";

/** Box 1 fields calculated by the Belastingdienst — no jaaropgave is ever issued */
export const CALCULATED_FIELDS = ["Eigenwoningforfait"];

type SecondaryMatcher = {
  fieldContains: string;
  getJaaropgaveAmount: (acct: AccountData) => number | null;
};

const wageAmount = (acct: AccountData): number | null =>
  acct.amounts["wage"]?.["taxableWage"] ?? acct.amounts["wage"]?.["grossWage"] ?? null;

/** Entries that can be matched by amount when account-number matching doesn't apply */
export const SECONDARY_MATCHERS: SecondaryMatcher[] = [
  {
    fieldContains: "Loon",
    getJaaropgaveAmount: wageAmount,
  },
  {
    // LLM sometimes extracts the section header instead of the per-employer line
    fieldContains: "inkomsten uit werk",
    getJaaropgaveAmount: wageAmount,
  },
  {
    fieldContains: "arbeidsongeschiktheid",
    getJaaropgaveAmount: (acct) => acct.amounts["other"]?.["premiumPaid"] ?? null,
  },
];

export function applyExceptions(
  matched: MatchedPair[],
  onlyInAangifte: TaxReturnEntry[],
  onlyInJaaropgave: UnmatchedJaaropgave[],
): { matched: MatchedPair[]; onlyInAangifte: TaxReturnEntry[]; onlyInJaaropgave: UnmatchedJaaropgave[] } {
  const normalizeField = (s: string) => s.replace(/-/g, "").toLowerCase();

  // Step 1: remove entries that have no jaaropgave by design
  let remainingAangifte = onlyInAangifte.filter(
    (e) => !CALCULATED_FIELDS.some((f) => normalizeField(e.field).includes(normalizeField(f)))
  );

  const newMatched = [...matched];
  let remainingJaaropgave = [...onlyInJaaropgave];

  // Step 2: secondary matching by amount — field name is the constraint, not accountNumber
  const stillUnmatched: TaxReturnEntry[] = [];
  for (const entry of remainingAangifte) {
    const matcher = SECONDARY_MATCHERS.find((m) => normalizeField(entry.field).includes(normalizeField(m.fieldContains)));
    if (!matcher) { stillUnmatched.push(entry); continue; }

    const jaaropgaveIdx = remainingJaaropgave.findIndex((j) => {
      const jAmount = matcher.getJaaropgaveAmount(j.account);
      return jAmount !== null && Math.abs(Math.abs(entry.amount) - jAmount) <= 1;
    });

    if (jaaropgaveIdx === -1) { stillUnmatched.push(entry); continue; }

    const jaaropgave = remainingJaaropgave[jaaropgaveIdx];
    newMatched.push({ aangifte: entry, jaaropgave });
    remainingJaaropgave = remainingJaaropgave.filter((_, i) => i !== jaaropgaveIdx);
  }

  return { matched: newMatched, onlyInAangifte: stillUnmatched, onlyInJaaropgave: remainingJaaropgave };
}
