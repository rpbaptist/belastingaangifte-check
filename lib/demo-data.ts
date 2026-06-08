import type { AnalysisReport, ExtractedData } from "@/lib/types";

export const DEMO_REPORT: AnalysisReport = {
  taxYear: 2024,
  covered: [
    {
      field: "Saldo bank- en spaarrekeningen",
      accountNumber: "NL91INGB0001234567",
      institution: "ING",
      amountTaxReturn: 15432,
      amountStatement: 15432,
    },
    {
      field: "Saldo bank- en spaarrekeningen",
      accountNumber: "NL89ABNA0123456789",
      institution: "ABN AMRO",
      amountTaxReturn: 28750,
      amountStatement: 28750,
    },
    {
      field: "Hypotheekrente",
      accountNumber: "NL64RABO0456789012",
      institution: "Rabobank",
      amountTaxReturn: 8640,
      amountStatement: 8640,
    },
    {
      field: "Loon",
      accountNumber: "123456789L01",
      institution: "Werkgever Demo B.V.",
      amountTaxReturn: 42500,
      amountStatement: 42500,
    },
  ],
  missingStatement: [
    {
      field: "Premies lijfrenten",
      accountNumber: "LP2024-001",
      amount: 2500,
      box: "1",
    },
  ],
  notFilledIn: [
    {
      accountNumber: "NL11ASNB0987654321",
      institution: "ASN Bank",
      description: "Spaartegoed",
      amount: 4200,
    },
  ],
  attentionPoints: [
    {
      title: "Aflossingsvrij hypotheekdeel",
      explanation:
        "Je hypotheek bij Rabobank heeft een aflossingsvrij deel. Voor hypotheken afgesloten na 1 januari 2013 geldt hypotheekrenteaftrek alleen als er daadwerkelijk wordt afgelost. Controleer of het aflossingsvrije deel onder het overgangsrecht valt.",
      institution: "Rabobank",
      accountNumber: "NL64RABO0456789012",
    },
    {
      title: "Buitenlandse bronbelasting",
      explanation:
        "Bij DeGiro is € 87 buitenlandse bronbelasting ingehouden op buitenlands dividend. Dit bedrag kan via de aangifte worden verrekend of als kostenpost worden opgevoerd, afhankelijk van het verdragsland. Controleer of het correct is verwerkt in box 3.",
      institution: "DeGiro",
      accountNumber: "DG-9876543",
    },
    {
      title: "Spaartegoed niet opgegeven",
      explanation:
        "ASN Bank heeft een spaartegoed van € 4.200 gerapporteerd dat niet in de aangifte staat. Box 3 vereist opgave van alle saldi op de peildatum 1 januari 2024. Voeg dit bedrag toe aan je aangifte.",
      institution: "ASN Bank",
      accountNumber: "NL11ASNB0987654321",
      initialMessages: [
        {
          role: "user",
          content: "Wat zijn de gevolgen als ik dit vergeten ben op te geven?",
        },
        {
          role: "assistant",
          content:
            "Als je het spaartegoed van € 4.200 niet hebt opgegeven in box 3, kan de Belastingdienst dit later corrigeren via een navorderingsaanslag. Daarvoor geldt een termijn van vijf jaar.\n\n**Praktisch advies:**\n- Dien een verbeterde aangifte in via Mijn Belastingdienst. Dit kan tot vijf jaar na het belastingjaar.\n- Het belastingeffect is beperkt: box 3 wordt belast op basis van een forfaitair rendement. Voor € 4.200 extra vermogen is de extra belasting doorgaans slechts een tientje per jaar.\n- Als je totale vermogen onder het heffingsvrije vermogen blijft (€ 57.000 voor alleenstaanden in 2024), is er helemaal geen extra belasting verschuldigd.",
        },
      ],
    },
  ],
  extractionErrors: [],
};

export const DEMO_EXTRACTED_DATA: ExtractedData = {
  taxReturn: { taxYear: 2024, entries: [] },
  annualStatements: [],
};
