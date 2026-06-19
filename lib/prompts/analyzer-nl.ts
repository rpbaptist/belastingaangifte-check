import type { AmountMismatch } from "../categorizer";

export function buildUserMessage(
  amountMismatches: AmountMismatch[],
  covered: { accountNumber: string; institution: string }[]
): string {
  const parts: string[] = [];

  parts.push(
    "## Bedragsverschillen (bekijk elk — bedragen verschillen meer dan €1)",
    "",
    JSON.stringify(amountMismatches, null, 2),
    ""
  );

  parts.push(
    "## Gedekte rekeningen (al vergeleken door code — stel geen vragen over volledigheid voor deze)",
    "",
    JSON.stringify(
      covered.map((c) => ({ institution: c.institution, accountNumber: c.accountNumber })),
      null,
      2
    ),
    "",
    "Genereer de aandachtspunten. Reageer alleen met het ruwe JSON-object — start je reactie met `{`."
  );

  return parts.join("\n");
}

export function buildAnalyzerPrompt(rules: string): string {
  return `You bent een Nederlandse belastinganalist. De reconciliatie tussen aangifte en jaaropgave is door code uitgevoerd. Je ontvangt de lijst met al gedekte rekeningen — stel geen aandachtspunten op die in twijfel trekken of die rekeningen in de aangifte voorkomen; die controle is al gedaan. Jouw taak is om bedragsverschillen te beoordelen en aandachtspunten te genereren voor alles wat een Nederlandse belastingexpert zou aanmerken.

## Bedragsverschillen

Je ontvangt paren waarbij de aangifte en jaaropgave meer dan €1 van elkaar verschillen. Voor elk:
- Bepaal of het verschil een echte aangiftefout is of een verwachte levenscyclusgebeurtenis (rente over deel van het jaar, rekening geopend of gesloten halverwege het jaar, hypotheek halverwege het jaar afgelost)
- Als het een echt probleem is, genereer een aandachtspunt
- Als het een levenscyclusgebeurtenis is die geen aangiftefout betreft, genereer dan geen aandachtspunt

## Aanvullende aandachtspuntenregels

${rules}

## Uitvoer

Je reactie moet een enkel ruw JSON-object zijn — niets voor de openingsaccolade, niets na de sluitingsaccolade. Geen markdown-fences, geen proza, geen uitleg.

{
  "attentionPoints": [
    {
      "title": "Bedrag wijkt af",
      "explanation": "De aangifte toont €8.400 maar de jaaropgave toont €9.200. Controleer of het correcte bedrag is ingevoerd.",
      "institution": "Hypotheekverstrekker",
      "accountNumber": "1926.58.069"
    }
  ]
}

Als er geen aandachtspunten te rapporteren zijn, retourneer: {"attentionPoints": []}`;
}
