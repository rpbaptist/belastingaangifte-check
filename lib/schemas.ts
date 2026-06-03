import { z } from "zod";

export const AccountDataSchema = z.object({
  accountNumber: z.string(),
  description: z.string(),
  amounts: z.record(z.string(), z.record(z.string(), z.number())),
});

export const AnnualStatementSchema = z.object({
  institution: z.string(),
  institutionType: z.enum(["bank", "broker", "mortgage", "other"]),
  taxYear: z.number().int(),
  accounts: z.array(AccountDataSchema),
  metadata: z.record(z.string(), z.string()).default({}),
});

export const TaxReturnEntrySchema = z.object({
  box: z.enum(["1", "2", "3"]),
  field: z.string(),
  accountNumber: z.string().nullable(),
  amount: z.number(),
});

export const TaxReturnSchema = z.object({
  taxYear: z.number().int(),
  entries: z.array(TaxReturnEntrySchema),
});

const CoveredItemSchema = z.object({
  field: z.string(),
  accountNumber: z.string(),
  institution: z.string(),
  amountTaxReturn: z.number(),
  amountStatement: z.number(),
});

const MissingStatementItemSchema = z.object({
  field: z.string(),
  accountNumber: z.string().nullable(),
  amount: z.number(),
  box: z.enum(["1", "2", "3"]),
});

const NotFilledInItemSchema = z.object({
  accountNumber: z.string(),
  institution: z.string(),
  description: z.string(),
  amount: z.number(),
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
