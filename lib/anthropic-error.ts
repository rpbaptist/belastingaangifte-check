import Anthropic from "@anthropic-ai/sdk";
import { translate, type Language } from "./translations";

export function isUserFacingError(err: unknown): boolean {
  return (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.RateLimitError
  );
}

export function classifyError(
  err: unknown,
  language: Language = "nl"
): { status: number; message: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: translate("invalidApiKey", language) };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 403, message: translate("noAccessWithApiKey", language) };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: translate("tooManyRequests", language) };
  }
  if (err instanceof Anthropic.APIError && err.status >= 500) {
    return { status: 502, message: translate("anthropicServerError", language) };
  }
  const message = err instanceof Error ? err.message : translate("anthropicUnknownError", language);
  return { status: 500, message };
}
