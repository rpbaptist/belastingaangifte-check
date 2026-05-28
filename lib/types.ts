// ─── Extraction types ──────────────────────────────────────────────────────

export type InstitutionType = "bank" | "broker" | "mortgage" | "other";

export interface AnnualStatementData {
  institution: string;
  institutionType: InstitutionType;
  taxYear: number;
  accounts: AccountData[];
  metadata: Record<string, string>; // e.g. { mortgageType: "interest-only" }
}

export interface AccountData {
  accountNumber: string;
  description: string; // e.g. "Savings account", "Investment account"
  amounts: Record<string, number>; // e.g. { balance: 12345, interest: 234 }
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
  accountNumber?: string;
}

export interface ExtractionError {
  filename: string;
  error: string;
}

// ─── API request / response ────────────────────────────────────────────────

export interface AnalyseRequest {
  taxReturn: string; // base64-encoded PDF
  taxReturnFilename: string;
  annualStatements: Array<{
    data: string; // base64-encoded PDF
    filename: string;
  }>;
}

export interface AnalyseResponse {
  report: AnalysisReport;
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
