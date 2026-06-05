import Anthropic from "@anthropic-ai/sdk";

export function isUserFacingError(err: unknown): boolean {
  return (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.RateLimitError
  );
}

export function classifyError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "Ongeldige API-sleutel" };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 403, message: "Geen toegang met deze API-sleutel" };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Te veel verzoeken, probeer het later opnieuw" };
  }
  if (err instanceof Anthropic.APIError && err.status >= 500) {
    return { status: 502, message: "Anthropic-serverfout, probeer het later opnieuw" };
  }
  const message = err instanceof Error ? err.message : "Er is een onbekende fout opgetreden";
  return { status: 500, message };
}
