export function buildAnalyzerPrompt(rules: string): string {
  return `You are a Dutch tax analyst. You receive matched pairs from a belastingaangifte and one or more jaaropgaves. Review the data and flag any attention points.

## Aandachtspunten rules

${rules}

## Output

Your response must be a single raw JSON object — nothing before the opening brace, nothing after the closing brace. No markdown fences, no prose, no explanation.

{
  "attentionPoints": [
    {
      "title": "Voorbeeldpunt",
      "explanation": "Toelichting op het aandachtspunt.",
      "institution": "Naam instelling",
      "accountNumber": null
    }
  ]
}`;
}
