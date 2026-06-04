// ─── Extraction types ──────────────────────────────────────────────────────

export type InstitutionType = "bank" | "broker" | "mortgage" | "other";

export interface AnnualStatementData {
  institution: string;
  institutionType: InstitutionType;
  taxYear: number;
  accounts: AccountData[];
  metadata: Record<string, string>; // e.g. { mortgageType: "interest-only" }
}

export type AccountAmounts = Record<string, Record<string, number>>;

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

// ─── Extraction results (per PDF) ──────────────────────────────────────────

export type StatementExtractionResult =
  | { status: "success"; filename: string; data: AnnualStatementData }
  | { status: "failed"; filename: string; error: string };

// ─── Report types ──────────────────────────────────────────────────────────

export interface AnalysisReport {
  taxYear: number;
  covered: CoveredItem[];
  missingStatement: MissingStatementItem[];
  notFilledIn: NotFilledInItem[];
  attentionPoints: AttentionPoint[];
  extractionErrors: ExtractionError[];
}

export interface CoveredItem {
  field: string;
  accountNumber: string;
  institution: string;
  amountTaxReturn: number;
  amountStatement: number;
}

export interface MissingStatementItem {
  field: string;
  accountNumber: string | null;
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
  accountNumber?: string | null;
}

export interface ExtractionError {
  filename: string;
  error: string;
}

// ─── API request / response ────────────────────────────────────────────────

export interface AnalyseRequest {
  taxReturn: string; // extracted PDF text (BSN scrubbed)
  taxReturnFilename: string;
  annualStatements: Array<{
    data: string; // extracted PDF text (BSN scrubbed)
    filename: string;
  }>;
}

export interface ExtractedData {
  taxReturn: TaxReturnData;
  annualStatements: AnnualStatementData[];
}

export interface AnalyseResponse {
  report: AnalysisReport;
  extractedData: ExtractedData;
}

export interface IncrementalRequest {
  extractedData: ExtractedData;
  additionalStatements: Array<{ data: string; filename: string }>;
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
