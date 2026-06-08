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
  mortgage?: { interestPaid?: number; remainingDebt?: number; [key: string]: number | undefined };
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
