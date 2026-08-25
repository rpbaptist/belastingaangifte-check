import Anthropic from "@anthropic-ai/sdk";

export const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";
export const ANALYSIS_MODEL = "claude-sonnet-4-6";
export const QUESTION_MODEL = "claude-haiku-4-5-20251001";

export function createClient(apiKey?: string): Anthropic {
  return new Anthropic(apiKey ? { apiKey } : {});
}

export function extractResponseText(response: Anthropic.Message): string | undefined {
  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : undefined;
}
