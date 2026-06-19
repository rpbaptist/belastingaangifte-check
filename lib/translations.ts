export type Language = "nl" | "en";

export const translations = {
  // App chrome
  appTitle: { nl: "Aangifte Checker", en: "Tax Return Checker" },
  demoChip: { nl: "Demo", en: "Demo" },
  taxYearPrefix: { nl: "Belastingjaar", en: "Tax year" },
  viewDemo: { nl: "Bekijk demo", en: "View demo" },
  githubAriaLabel: { nl: "Bekijk broncode op GitHub", en: "View source code on GitHub" },
  reanalyze: { nl: "Opnieuw analyseren", en: "Analyze again" },

  // Upload view
  heroTitle: { nl: "Klopt je aangifte?", en: "Is your tax return correct?" },
  heroIntro: {
    nl: "Upload je belastingaangifte en jaaropgaves. De bedragen worden vergeleken en je ziet wat klopt, wat ontbreekt en waar je op moet letten.",
    en: "Upload your tax return and annual income statements. The amounts are compared and you'll see what's correct, what's missing, and what needs attention.",
  },
  privacyWarningStrong: {
    nl: "Let op: demo, geen privacygarantie.",
    en: "Note: demo, no privacy guarantee.",
  },
  privacyNoticeBefore: {
    nl: "De inhoud van je PDF's, inclusief je BSN, IBANs en financiële gegevens, wordt verstuurd naar de",
    en: "The contents of your PDFs, including your BSN, IBANs and financial data, are sent to the",
  },
  anthropicApiLinkText: { nl: "Anthropic API", en: "Anthropic API" },
  privacyNoticeAfter: {
    nl: "voor verwerking. Anthropic bewaart API-data standaard tot 30 dagen. Gebruik dit hulpmiddel uitsluitend voor eigen testdoeleinden en deel geen gegevens van anderen. Controleer altijd zelf de resultaten of raadpleeg een financieel adviseur.",
    en: "for processing. Anthropic retains API data for up to 30 days by default. Use this tool only for your own testing purposes and don't share other people's data. Always verify the results yourself or consult a financial advisor.",
  },
  taxReturnLabel: { nl: "Belastingaangifte", en: "Tax Return" },
  taxReturnDropHint: {
    nl: "Sleep je aangifte PDF hierheen, of klik om te bladeren",
    en: "Drag your tax return PDF here, or click to browse",
  },
  annualStatementsLabel: { nl: "Jaaropgaves", en: "Annual Income Statements" },
  annualStatementsDropHint: {
    nl: "Sleep één of meerdere PDF's hierheen of klik om te bladeren.",
    en: "Drag one or more PDFs here or click to browse.",
  },
  analyzing: { nl: "Bezig met analyseren…", en: "Analyzing…" },
  analyze: { nl: "Analyseren", en: "Analyze" },

  // Results view
  filesAangifteLabel: { nl: "Aangifte", en: "Tax Return" },
  filesJaaropgavesLabel: { nl: "Jaaropgaves", en: "Annual Income Statements" },
  defaultTaxReturnFilename: { nl: "aangifte.pdf", en: "tax-return.pdf" },
  editFiles: { nl: "Wijzig", en: "Edit" },
  resultEyebrow: { nl: "Resultaat", en: "Result" },
  resultTitle: { nl: "Je controle is klaar", en: "Your check is complete" },
  annualStatementSingular: { nl: "jaaropgave", en: "annual income statement" },
  annualStatementPlural: { nl: "jaaropgaves", en: "annual income statements" },
  comparedWithYourTaxReturnFor: {
    nl: "vergeleken met je aangifte over",
    en: "compared with your tax return for",
  },
  boxPrefix: { nl: "Box", en: "Box" },

  // Report sections / summary boxes
  coveredLabel: { nl: "Gedekt", en: "Covered" },
  coveredNote: {
    nl: "Aangifte en jaaropgave komen overeen",
    en: "Tax return and annual income statement match",
  },
  missingStatementLabel: { nl: "Jaaropgave ontbreekt", en: "Annual Income Statement Missing" },
  missingStatementNote: {
    nl: "Staat in je aangifte, geen jaaropgave geüpload",
    en: "Listed in your tax return, no annual income statement uploaded",
  },
  notFilledInSummaryLabel: { nl: "Niet ingevuld", en: "Not Included" },
  notFilledInSectionTitle: { nl: "Niet ingevuld in aangifte", en: "Not Included in Tax Return" },
  notFilledInNote: {
    nl: "Staat in je jaaropgaves, ontbreekt in aangifte",
    en: "Listed in your annual income statements, missing from tax return",
  },
  attentionPointsLabel: { nl: "Aandachtspunten", en: "Attention Points" },

  // Analysis progress
  stepReading: { nl: "Documenten lezen", en: "Reading documents" },
  stepExtracting: { nl: "Gegevens extraheren", en: "Extracting data" },
  stepAnalysing: { nl: "Vergelijken en analyseren", en: "Comparing and analyzing" },
  analysisTimeNotice: {
    nl: "Dit kan een paar minuten duren.",
    en: "This can take a few minutes.",
  },

  // Attention point card / chat
  hideConversation: { nl: "Verberg gesprek", en: "Hide conversation" },
  viewConversation: { nl: "Bekijk gesprek", en: "View conversation" },
  askQuestion: { nl: "Stel een vraag", en: "Ask a question" },
  busy: { nl: "Bezig…", en: "Working…" },
  moreDetail: { nl: "Meer uitleg", en: "More detail" },
  resolved: { nl: "Opgelost", en: "Resolved" },
  markResolved: { nl: "Markeer als opgelost", en: "Mark as resolved" },
  answering: { nl: "Bezig met antwoorden…", en: "Answering…" },
  followUpPlaceholder: { nl: "Vervolgvraag…", en: "Follow-up question…" },
  questionPlaceholder: { nl: "Typ je vraag…", en: "Type your question…" },
  sendAriaLabel: { nl: "Verstuur", en: "Send" },
  moreDetailQuestion: {
    nl: "Geef een uitgebreidere uitleg over dit aandachtspunt.",
    en: "Give a more detailed explanation of this attention point.",
  },

  // API key input
  apiKeySet: { nl: "API-sleutel ingesteld", en: "API key set" },
  change: { nl: "Wijzigen", en: "Change" },
  apiKeyLabel: { nl: "Jouw Anthropic API-sleutel", en: "Your Anthropic API key" },
  apiKeyHelp: {
    nl: "Wordt alleen in je browser sessie opgeslagen. Niet op de server. Gebruik een tijdelijke of beperkte key.",
    en: "Only stored in your browser session. Not on the server. Use a temporary or limited key.",
  },
  cancel: { nl: "Annuleren", en: "Cancel" },

  // Error card
  taxReturnProcessingFailedTitle: {
    nl: "Aangifte kon niet worden verwerkt",
    en: "Tax return could not be processed",
  },
  extractionFailedForLabel: { nl: "Extractie mislukt voor", en: "Extraction failed for" },
  oneFile: { nl: "één bestand", en: "one file" },
  filesPlural: { nl: "bestanden", en: "files" },

  // Incremental card
  forgotStatementTitle: { nl: "Jaaropgave vergeten?", en: "Forgot an annual income statement?" },
  forgotStatementDesc: {
    nl: "Upload een vergeten jaaropgave. Alleen de nieuwe bestanden worden opnieuw verwerkt.",
    en: "Upload a forgotten annual income statement. Only the new files will be processed again.",
  },
  additionalStatementsLabel: {
    nl: "Aanvullende jaaropgaves",
    en: "Additional annual income statements",
  },
  additionalStatementsHint: {
    nl: "Sleep de vergeten PDF's hierheen, of klik om te bladeren",
    en: "Drag the forgotten PDFs here, or click to browse",
  },
  processing: { nl: "Bezig met verwerken…", en: "Processing…" },
  analyzeAddition: { nl: "Analyseer aanvulling", en: "Analyze addition" },

  // Client-side fallback errors
  clientUnknownError: {
    nl: "Er is een onbekende fout opgetreden.",
    en: "An unknown error occurred.",
  },
  chatUnknownError: { nl: "Er is een fout opgetreden.", en: "An error occurred." },
  serverErrorPrefix: { nl: "Serverfout", en: "Server error" },

  // Server-side request validation errors
  invalidRequest: { nl: "Ongeldig verzoek", en: "Invalid request" },
  noTaxReturnReceived: { nl: "Geen aangifte ontvangen", en: "No tax return received" },
  atLeastOneStatementRequired: {
    nl: "Minimaal één jaaropgave is vereist",
    en: "At least one annual income statement is required",
  },
  noQuestionReceived: { nl: "Geen vraag ontvangen", en: "No question received" },
  noAnswerReceived: { nl: "Geen antwoord ontvangen", en: "No answer received" },
  noEarlierExtractedDataReceived: {
    nl: "Geen eerder geëxtraheerde data ontvangen",
    en: "No previously extracted data received",
  },
  atLeastOneAdditionalStatementRequired: {
    nl: "Minimaal één aanvullende jaaropgave is vereist",
    en: "At least one additional annual income statement is required",
  },
  invalidExtractedData: { nl: "Ongeldige geëxtraheerde data", en: "Invalid extracted data" },

  // Anthropic error classification
  invalidApiKey: { nl: "Ongeldige API-sleutel", en: "Invalid API key" },
  noAccessWithApiKey: {
    nl: "Geen toegang met deze API-sleutel",
    en: "No access with this API key",
  },
  tooManyRequests: {
    nl: "Te veel verzoeken, probeer het later opnieuw",
    en: "Too many requests, try again later",
  },
  anthropicServerError: {
    nl: "Anthropic-serverfout, probeer het later opnieuw",
    en: "Anthropic server error, try again later",
  },
  anthropicUnknownError: {
    nl: "Er is een onbekende fout opgetreden",
    en: "An unknown error occurred",
  },

  // Extraction session
  unknownError: { nl: "Onbekende fout", en: "Unknown error" },
  extractionFailedShort: { nl: "Extractie mislukt", en: "Extraction failed" },

  // Extractor
  extractionAbortedTooLarge: {
    nl: "Extractie afgebroken — het PDF is mogelijk te groot of te complex",
    en: "Extraction aborted — the PDF may be too large or too complex",
  },
  noResponseAnnualStatement: {
    nl: "Geen reactie ontvangen bij verwerking van de jaaropgave",
    en: "No response received while processing the annual income statement",
  },
  noResponseTaxReturn: {
    nl: "Geen reactie ontvangen bij verwerking van de aangifte",
    en: "No response received while processing the tax return",
  },
  unexpectedFormat: { nl: "onverwacht formaat", en: "unexpected format" },

  // Analyzer
  analysisAbortedTooMany: {
    nl: "Analyse afgebroken — te veel posten om te verwerken. Probeer met minder jaaropgaves tegelijk.",
    en: "Analysis aborted — too many entries to process. Try with fewer annual income statements at once.",
  },
  noResponseDuringAnalysis: {
    nl: "Geen reactie ontvangen tijdens de analyse",
    en: "No response received during analysis",
  },
} as const;

export type TranslationKey = keyof typeof translations;

export function translate(key: TranslationKey, language: Language): string {
  return translations[key][language];
}

export function formatTaxReturnProcessingError(
  filename: string,
  message: string,
  language: Language
): string {
  return language === "en"
    ? `Tax return "${filename}" could not be processed: ${message}`
    : `Aangifte "${filename}" kon niet worden verwerkt: ${message}`;
}

export function formatExtractionFailed(message: string, language: Language): string {
  return language === "en" ? `Extraction failed: ${message}` : `Extractie mislukt: ${message}`;
}

export function formatAnalysisFailed(message: string, language: Language): string {
  return language === "en" ? `Analysis failed: ${message}` : `Analyse mislukt: ${message}`;
}
