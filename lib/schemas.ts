import { z } from "zod";

const n = () => z.number().transform(Math.round);

const AccountAmountsSchema = z.union([
  z.object({ bank: z.object({ balance: n(), interest: n().optional() }) }),
  z.object({
    broker: z.object({
      dividend: n().optional(),
      foreignDividend: n().optional(),
      dutchDividendTax: n().optional(),
      foreignWithholdingTax: n().optional(),
    }),
  }),
  z.object({ mortgage: z.object({ interestPaid: n(), remainingDebt: n() }) }),
]);

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
  metadata: z.record(z.string(), z.string()).default({}),
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
  field: z.string(),
  accountNumber: z.string().nullable(),
  institution: z.string().nullable(),
  amountTaxReturn: z.number().transform(Math.round),
  amountStatement: z.number().transform(Math.round),
});

const MissingStatementItemSchema = z.object({
  field: z.string(),
  accountNumber: z.string().nullable(),
  amount: z.number().transform(Math.round),
  box: z.enum(["1", "2", "3"]),
});

const NotFilledInItemSchema = z.object({
  accountNumber: z.string().nullable(),
  institution: z.string().nullable(),
  description: z.string(),
  amount: z.number().transform(Math.round),
});

const AttentionPointSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  institution: z.string().optional(),
  accountNumber: z.string().nullable().optional(),
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
