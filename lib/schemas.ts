import { z } from "zod";

const n = () => z.number().transform(Math.round);
// LLM string fields: coerce null → "" so a missing value never crashes the parser
const s = () => z.string().nullable().catch(null).transform(v => v ?? "");

// Flexible nested record: handles bank/broker/mortgage and any other institution type.
// Numbers are rounded to full euros; the LLM interprets the structure semantically.
const AccountAmountsSchema = z.record(z.string(), z.record(z.string(), n()));

export const AccountDataSchema = z.object({
  accountNumber: z.string(),
  description: z.string(),
  amounts: AccountAmountsSchema,
});

export const AnnualStatementSchema = z.object({
  institution: z.string(),
  institutionType: z.enum(["bank", "broker", "mortgage", "other"]).catch("other"),
  taxYear: z.number().int(),
  accounts: z.array(AccountDataSchema),
  metadata: z.record(z.string(), z.unknown())
    .transform(obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)])))
    .default({}),
});

export const TaxReturnEntrySchema = z.object({
  box: z.enum(["1", "2", "3"]),
  field: z.string(),
  accountNumber: z.string().nullable(),
  amount: z.number().transform(Math.round),
});

export const TaxReturnSchema = z.object({
  taxYear: z.number().int(),
  entries: z.array(TaxReturnEntrySchema),
});

const CoveredItemSchema = z.object({
  field: s(),
  accountNumber: s(),
  institution: s(),
  amountTaxReturn: n(),
  amountStatement: n(),
});

const MissingStatementItemSchema = z.object({
  field: s(),
  accountNumber: s(),
  amount: n(),
  box: z.enum(["1", "2", "3"]),
});

const NotFilledInItemSchema = z.object({
  accountNumber: s(),
  institution: s(),
  description: s(),
  amount: n(),
});

const AttentionPointSchema = z.object({
  title: s(),
  explanation: s(),
  institution: s().optional(),
  accountNumber: s().optional(),
});

export const AnalysisReportSchema = z.object({
  taxYear: z.number().int(),
  covered: z.array(CoveredItemSchema),
  missingStatement: z.array(MissingStatementItemSchema),
  notFilledIn: z.array(NotFilledInItemSchema),
  attentionPoints: z.array(AttentionPointSchema),
});

const ExtractionErrorSchema = z.object({
  filename: z.string(),
  error: z.string(),
});

const FullAnalysisReportSchema = AnalysisReportSchema.extend({
  extractionErrors: z.array(ExtractionErrorSchema),
});

const ExtractedDataSchema = z.object({
  taxReturn: TaxReturnSchema,
  annualStatements: z.array(AnnualStatementSchema),
});

export const AnalyseResponseSchema = z.object({
  report: FullAnalysisReportSchema,
  extractedData: ExtractedDataSchema,
});

export const QuestionResponseSchema = z.object({
  answer: z.string(),
});

export const ApiErrorSchema = z
  .object({ error: z.string().optional() })
  .catch({ error: undefined });
