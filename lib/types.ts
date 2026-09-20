// ─── Extraction types ──────────────────────────────────────────────────────

export type InstitutionType = "bank" | "broker" | "mortgage" | "other";

export interface AnnualStatementData {
  institution: string;
  institutionType: InstitutionType;
  taxYear: number;
  accounts: AccountData[];
  metadata: Record<string, string>; // e.g. { mortgageType: "interest-only" }
}

export interface AccountAmounts {
  bank?: { balance?: number; wage?: number; [key: string]: number | undefined };
  broker?: {
    balance?: number;
    dutchDividendTax?: number;
    foreignWithholdingTax?: number;
    dividend?: number;
    foreignDividend?: number;
    [key: string]: number | undefined;
  };
  mortgage?: {
    interestPaid?: number;
    openingDebt?: number;
    remainingDebt?: number;
    [key: string]: number | undefined;
  };
  wage?: { taxableWage?: number; grossWage?: number; [key: string]: number | undefined };
  other?: {
    premiumPaid?: number;
    premium?: number;
    annualPremium?: number;
    [key: string]: number | undefined;
  };
  [key: string]: { [key: string]: number | undefined } | undefined;
}

export interface AccountData {
  accountNumber: string;
  description: string;
  amounts: AccountAmounts;
}

export interface TaxReturnData {
  taxYear: number;
  entries: TaxReturnEntry[];
}

export interface TaxReturnEntry {
  box: "1" | "2" | "3";
  field: string; // e.g. "Saldo bank en spaarrekeningen", "Hypotheekrente"
  accountNumber: string | null;
  amount: number; // always full euros, rounded by Belastingdienst
}

// ─── Property bewijsstukken (notarisafrekening, WOZ-beschikking, makelaarsnota) ────────────
//
// Unlike a jaaropgave, these carry no rekeningnummer of their own — the only IBAN on a
// notarisafrekening is where the sale proceeds were paid, not the document's identity (ADR
// 0002 amendment). They never enter account matching (lib/reconciler.ts) and get a closed
// set of amount kinds instead of free-form keys, because key selection has proven reliable
// only where a prompt vocabulary exists (see docs/adr/0002).

export type PropertyDocumentKind = "notarisafrekening" | "wozBeschikking" | "makelaarsnota";

export type PropertyAmountKind =
  | "saleProceeds" // verkoopopbrengst
  | "notaryCosts" // notariskosten
  | "brokerCommission" // courtage
  | "loanRepayment" // aflossing geldlening
  | "wozValue"; // WOZ-waarde

export interface PropertyAmount {
  // null: an amount the model found on the page but that fits none of the closed kinds.
  // The raw label is always kept so it is still traceable, never silently dropped.
  kind: PropertyAmountKind | null;
  label: string;
  amount: number;
}

export interface PropertyStatementData {
  documentKind: PropertyDocumentKind;
  institution: string;
  taxYear: number;
  amounts: PropertyAmount[];
}

// A bewijsstuk the extractor could not place in any recognised kind (jaaropgave or one of
// the three property kinds). Reported as a finding rather than silently producing nothing.
export interface UnrecognizedDocument {
  institution: string;
  taxYear: number | null;
}

// ─── Extraction results (per PDF) ──────────────────────────────────────────

// The result of extracting one uploaded bewijsstuk. Its prompt/schema first identifies which
// kind of document it is, then extracts accordingly — a document is never force-fit into the
// jaaropgave shape just because that was the only shape extraction used to produce.
export type StatementExtraction =
  | { documentKind: "jaaropgave"; annualStatement: AnnualStatementData }
  | { documentKind: PropertyDocumentKind; propertyStatement: PropertyStatementData }
  | { documentKind: "unrecognized"; institution: string; taxYear: number | null };

export type StatementExtractionResult =
  | { status: "success"; filename: string; data: AnnualStatementData }
  | { status: "failed"; filename: string; error: string };

// ─── Report types ──────────────────────────────────────────────────────────

export interface AnalysisReport {
  taxYear: number;
  covered: CoveredItem[];
  missingStatement: MissingStatementItem[];
  notFilledIn: NotFilledInItem[];
  // Property bewijsstukken never enter matching, so their amounts are listed here rather
  // than folded into covered/missingStatement/notFilledIn.
  propertyStatements: PropertyStatementData[];
  findings: Finding[];
  attentionPoints: AttentionPoint[];
  extractionErrors: ExtractionError[];
}

// The kinds of thing the deterministic Validation layer can fail to read, each carrying
// exactly the fields its kind uses. Distinct from an aandachtspunt: a finding says the tool
// could not read something, not something about the filer's tax position. See ADR 0008 —
// the check reports, it never repairs.

// A bewijsstuk covering a different tax year than the aangifte.
export interface TaxYearMismatchFinding {
  kind: "taxYearMismatch";
  institution: string;
}

// Rows identical in every field, collapsed to one.
export interface DuplicateRowFinding {
  kind: "duplicateRow";
}

// An amount of a kind nothing downstream understands. Property bewijsstukken carry no
// rekeningnummer (see Property bewijsstuk in CONTEXT.md), so accountNumber is only present
// when this is raised against a jaaropgave account.
export interface UnknownAmountKindFinding {
  kind: "unknownAmountKind";
  institution: string;
  accountNumber?: string;
  field: string;
}

// A matched pair whose bewijsstuk amount could not be resolved.
export interface UnresolvedAmountFinding {
  kind: "unresolvedAmount";
  institution: string;
  accountNumber: string;
  field: string;
}

// An amount whose sign contradicts its kind (a magnitude gone negative). ADR 0008: the
// proposed correction is data the check attaches, never a mutation it performs.
export interface SignContradictionFinding {
  kind: "signContradiction";
  institution: string;
  accountNumber: string;
  field: string;
  proposedCorrection: { before: number | null; after: number | null };
}

// A bewijsstuk that matched none of the known document kinds. Institution is only present
// when the extractor could read one.
export interface UnrecognizedDocumentFinding {
  kind: "unrecognizedDocument";
  institution?: string;
}

export type FindingVariant =
  | TaxYearMismatchFinding
  | DuplicateRowFinding
  | UnknownAmountKindFinding
  | UnresolvedAmountFinding
  | SignContradictionFinding
  | UnrecognizedDocumentFinding;

export type Finding = { title: string; detail: string } & FindingVariant;

export interface CoveredItem {
  field: string;
  accountNumber: string;
  institution: string;
  amountTaxReturn: number;
  amountStatement: number;
}

export interface MissingStatementItem {
  field: string;
  accountNumber: string;
  amount: number;
  box: "1" | "2" | "3";
}

export interface NotFilledInItem {
  accountNumber: string;
  institution: string;
  description: string;
  amount: number;
}

export interface AttentionPoint {
  title: string;
  explanation: string;
  institution?: string;
  accountNumber?: string;
  initialMessages?: ChatMessage[];
}

export interface ExtractionError {
  filename: string;
  error: string;
}

// ─── API request / response ────────────────────────────────────────────────

export interface ExtractedData {
  taxReturn: TaxReturnData;
  annualStatements: AnnualStatementData[];
  propertyStatements: PropertyStatementData[];
  unrecognizedDocuments: UnrecognizedDocument[];
}

export interface QuestionRequest {
  question: string;
  attentionPoint: AttentionPoint;
  taxYear: number;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface QuestionResponse {
  answer: string;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
