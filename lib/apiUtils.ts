import type { Language } from "./translations";

export function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { "x-api-key": apiKey } : {};
}

export function languageHeaders(language: Language): Record<string, string> {
  return { "x-language": language };
}
