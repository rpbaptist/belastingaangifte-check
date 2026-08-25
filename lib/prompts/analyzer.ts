import type { AmountMismatch } from "../categorizer";
import type { Language } from "../translations";
import * as nl from "./analyzer-nl";
import * as en from "./analyzer-en";

const builders = { nl, en };

export function buildUserMessage(
  amountMismatches: AmountMismatch[],
  covered: { accountNumber: string; institution: string }[],
  language: Language = "nl"
): string {
  return builders[language].buildUserMessage(amountMismatches, covered);
}

export function buildAnalyzerPrompt(
  rules: string,
  language: Language = "nl",
  retrievedContext: string = ""
): string {
  return builders[language].buildAnalyzerPrompt(rules, retrievedContext);
}
