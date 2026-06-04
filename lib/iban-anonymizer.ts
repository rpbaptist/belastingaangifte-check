import type { AnalysisReport } from "./types";

/** Forward map (normalised IBAN → pseudonym) and reverse map (pseudonym → normalised IBAN) */
export type IbanMaps = {
  forward: Record<string, string>;
  reverse: Record<string, string>;
};

// Any IBAN: 2-letter country code + 2 check digits + BBAN (9-30 alphanumeric chars).
// Matches both compact (no spaces) and printed (space-separated 4-char groups) forms.
export const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,6}(?:\s?[A-Z0-9]{1,4})?\b/gi;

export function normalizeIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

/**
 * Build (or extend) a shared IBAN map from one or more raw texts.
 * Pseudonym format: [IBAN:BANKCODE:NNN] — the LLM can read institution context directly
 * without needing to infer it from an opaque hash.
 * Pass `existing` when adding new documents to an already-running session.
 */
export function buildSharedIbanMaps(
  rawTexts: string[],
  existing: IbanMaps = { forward: {}, reverse: {} }
): IbanMaps {
  const forward = { ...existing.forward };
  const reverse = { ...existing.reverse };

  // Seed per-bank counters from existing pseudonyms so new ones don't collide
  const counters: Record<string, number> = {};
  for (const pseudo of Object.values(forward)) {
    const m = pseudo.match(/^IBAN-([A-Z]{4})-(\d{3})$/);
    if (m) counters[m[1]] = Math.max(counters[m[1]] ?? 0, parseInt(m[2], 10));
  }

  for (const text of rawTexts) {
    for (const match of text.match(new RegExp(IBAN_RE.source, "gi")) ?? []) {
      const norm = normalizeIban(match);
      if (forward[norm]) continue; // already mapped
      const code = norm.slice(4, 8); // bank code, e.g. "INGB", "RABO", "ASNB"
      counters[code] = (counters[code] ?? 0) + 1;
      const pseudo = `IBAN-${code}-${counters[code].toString().padStart(3, "0")}`;
      forward[norm] = pseudo;
      reverse[pseudo] = norm;
    }
  }

  return { forward, reverse };
}

/** Replace pseudonymised IBANs in a report with their original values using the reverse map */
export function dereferenceReport(report: AnalysisReport, map: Record<string, string> = {}): AnalysisReport {
  if (!Object.keys(map).length) return report;
  const r = (v: string | null | undefined) => (v != null ? (map[v] ?? v) : v);
  return {
    ...report,
    covered:          report.covered.map(c => ({ ...c, accountNumber: r(c.accountNumber) as string })),
    missingStatement: report.missingStatement.map(m => ({ ...m, accountNumber: r(m.accountNumber) as string | null })),
    notFilledIn:      report.notFilledIn.map(n => ({ ...n, accountNumber: r(n.accountNumber) as string })),
    attentionPoints:  report.attentionPoints.map(a => ({ ...a, accountNumber: r(a.accountNumber) as string | null | undefined })),
  };
}

/** Apply the forward IBAN map and BSN scrub to raw text */
export function applyPrivacyFilter(rawText: string, forward: Record<string, string>): string {
  return rawText
    .replace(new RegExp(IBAN_RE.source, "gi"), (match) => forward[normalizeIban(match)] ?? match)
    .replace(
      /(BSN|Burgerservicenummer)\s*:?\s*\d{9}/gi,
      (match) => match.replace(/\d{9}/, "[verwijderd]")
    );
}
