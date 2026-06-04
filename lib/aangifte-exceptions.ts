import type { MatchedPair, UnmatchedJaaropgave } from "./account-matcher";
import type { AccountData, TaxReturnEntry } from "./types";

/** Box 1 fields calculated by the Belastingdienst — no jaaropgave is ever issued */
export const CALCULATED_FIELDS = ["Eigenwoningforfait"];

type SecondaryMatcher = {
  fieldContains: string;
  getJaaropgaveAmount: (acct: AccountData) => number | null;
};

/** Entries with null accountNumber that can be matched by amount instead */
export const SECONDARY_MATCHERS: SecondaryMatcher[] = [
  {
    fieldContains: "Loon",
    getJaaropgaveAmount: (acct) => acct.amounts["wage"]?.["taxableWage"] ?? null,
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
  // Step 1: remove entries that have no jaaropgave by design
  let remainingAangifte = onlyInAangifte.filter(
    (e) => !CALCULATED_FIELDS.some((f) => e.field.includes(f))
  );

  const newMatched = [...matched];
  let remainingJaaropgave = [...onlyInJaaropgave];

  // Step 2: secondary matching by amount for null-accountNumber entries
  const stillUnmatched: TaxReturnEntry[] = [];
  for (const entry of remainingAangifte) {
    if (entry.accountNumber !== null) { stillUnmatched.push(entry); continue; }

    const matcher = SECONDARY_MATCHERS.find((m) => entry.field.includes(m.fieldContains));
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
