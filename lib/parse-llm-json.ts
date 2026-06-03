export function parseLlmJson(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Model returned explanatory text instead of JSON (e.g. wrong document type).
    // Surface the model's own message — it's more useful than a SyntaxError.
    const preview = stripped.replace(/\s+/g, " ").trim();
    throw new Error(preview || "Model heeft geen gestructureerde data teruggegeven");
  }
}
