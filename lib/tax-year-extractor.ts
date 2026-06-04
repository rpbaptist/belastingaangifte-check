const CURRENT_YEAR = new Date().getFullYear();

/**
 * Find the most plausible Dutch tax year in extracted text.
 * Looks for a year (2020–current) near known context words first;
 * falls back to any year in that range.
 */
export function extractTaxYear(text: string): number | null {
  const contextMatch = text.match(
    /(?:belastingjaar|jaaropgave|aangifte|inkomsten|jaar)\s+(?:over\s+)?(\d{4})/i
  );
  if (contextMatch) {
    const y = parseInt(contextMatch[1], 10);
    if (y >= 2020 && y <= CURRENT_YEAR) return y;
  }
  const allYears = [...text.matchAll(/\b(20[2-9]\d)\b/g)]
    .map((m) => parseInt(m[1], 10))
    .filter((y) => y >= 2020 && y <= CURRENT_YEAR);
  return allYears.length ? Math.max(...allYears) : null;
}
