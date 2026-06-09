export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface ParsedExtractionError {
  filename: string;
  detail: string;
}

export function parseExtractionError(message: string): ParsedExtractionError | null {
  const m = message.match(/^Aangifte "([^"]+)" kon niet worden verwerkt: ([\s\S]*)/);
  return m ? { filename: m[1], detail: m[2] } : null;
}

export function formatMetadata(parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(" · ");
}
