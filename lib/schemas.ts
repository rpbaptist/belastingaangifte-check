import { z } from "zod";
import type { AccountAmounts, StatementExtraction } from "./types";

// Cents are preserved through the schema for jaaropgave amounts (AccountAmountsSchema);
// only display truncates to whole euros. Aangifte amounts (TaxReturnEntrySchema) are
// still rounded — the Belastingdienst always reports whole euros, so a residual
// fraction there is a hallucination, not signal (docs/decisions.md §4).
const n = () => z.number();
// LLM string fields: coerce null → "" so a missing value never crashes the parser
const s = () =>
  z
    .string()
    .nullable()
    .catch(null)
    .transform((v) => v ?? "");

// Flexible nested record: handles bank/broker/mortgage and any other category the LLM produces.
// Cents are preserved. The transform aligns the inferred type with AccountAmounts
// without constraining which keys the LLM may emit.
const AccountAmountsSchema = z
  .record(z.string(), z.record(z.string(), n()))
  .transform((v) => v as AccountAmounts);

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
  metadata: z
    .record(z.string(), z.unknown())
    .transform((obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)])))
    .default({}),
});

// Property bewijsstukken (notarisafrekening, WOZ-beschikking, makelaarsnota) get a closed set
// of amount kinds from the start (ADR 0002 amendment) — kind selection has proven reliable
// only where a prompt vocabulary exists. kind is nullable: an amount the model found but that
// fits none of the closed kinds is still reported, with its raw label, rather than invented
// into a new key (see lib/validation.ts — surfaced as an unknownAmountKind finding).
const PropertyAmountSchema = z.object({
  kind: z
    .enum(["saleProceeds", "notaryCosts", "brokerCommission", "loanRepayment", "wozValue"])
    .nullable()
    .catch(null),
  label: s(),
  amount: n(),
});

const PropertyStatementFieldsSchema = z.object({
  institution: z.string(),
  taxYear: z.number().int(),
  amounts: z.array(PropertyAmountSchema),
});

// One extraction call per uploaded bewijsstuk identifies which kind of document it is, then
// extracts accordingly — a document is never force-fit into the jaaropgave shape just because
// that used to be the only shape extraction produced (the bug #109 fixes).
//
// z.discriminatedUnion needs each branch to be a plain object schema with the discriminant as
// a literal, so the flat LLM-facing shape is unioned first and reshaped into the nested
// StatementExtraction the rest of the app consumes in a separate `.transform()` afterwards.
const JaaropgaveExtractionSchema = AnnualStatementSchema.extend({
  documentKind: z.literal("jaaropgave"),
});

const NotarisafrekeningExtractionSchema = PropertyStatementFieldsSchema.extend({
  documentKind: z.literal("notarisafrekening"),
});

const WozBeschikkingExtractionSchema = PropertyStatementFieldsSchema.extend({
  documentKind: z.literal("wozBeschikking"),
});

const MakelaarsnotaExtractionSchema = PropertyStatementFieldsSchema.extend({
  documentKind: z.literal("makelaarsnota"),
});

const UnrecognizedExtractionSchema = z.object({
  documentKind: z.literal("unrecognized"),
  institution: s(),
  taxYear: z.number().int().nullable().catch(null),
});

export const StatementExtractionSchema = z
  .discriminatedUnion("documentKind", [
    JaaropgaveExtractionSchema,
    NotarisafrekeningExtractionSchema,
    WozBeschikkingExtractionSchema,
    MakelaarsnotaExtractionSchema,
    UnrecognizedExtractionSchema,
  ])
  .transform((raw): StatementExtraction => {
    if (raw.documentKind === "jaaropgave") {
      const { documentKind, ...annualStatement } = raw;
      return { documentKind, annualStatement };
    }
    if (raw.documentKind === "unrecognized") return raw;
    const { documentKind, ...fields } = raw;
    return { documentKind, propertyStatement: { documentKind, ...fields } };
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

// One sub-schema per Finding variant (lib/types.ts), each carrying exactly the fields its
// kind uses. z.discriminatedUnion needs the discriminant as a literal on every branch.
const TaxYearMismatchFindingSchema = z.object({
  kind: z.literal("taxYearMismatch"),
  title: s(),
  detail: s(),
  institution: s(),
});

const DuplicateRowFindingSchema = z.object({
  kind: z.literal("duplicateRow"),
  title: s(),
  detail: s(),
});

// accountNumber is only present when raised against a jaaropgave account — property
// bewijsstukken carry no rekeningnummer (see Property bewijsstuk in CONTEXT.md).
const UnknownAmountKindFindingSchema = z.object({
  kind: z.literal("unknownAmountKind"),
  title: s(),
  detail: s(),
  institution: s(),
  accountNumber: s().optional(),
  field: s(),
});

const UnresolvedAmountFindingSchema = z.object({
  kind: z.literal("unresolvedAmount"),
  title: s(),
  detail: s(),
  institution: s(),
  accountNumber: s(),
  field: s(),
});

const SignContradictionFindingSchema = z.object({
  kind: z.literal("signContradiction"),
  title: s(),
  detail: s(),
  institution: s(),
  accountNumber: s(),
  field: s(),
  proposedCorrection: z.object({ before: n().nullable(), after: n().nullable() }),
});

// institution is only present when the extractor could read one.
const UnrecognizedDocumentFindingSchema = z.object({
  kind: z.literal("unrecognizedDocument"),
  title: s(),
  detail: s(),
  institution: s().optional(),
});

const FindingSchema = z.discriminatedUnion("kind", [
  TaxYearMismatchFindingSchema,
  DuplicateRowFindingSchema,
  UnknownAmountKindFindingSchema,
  UnresolvedAmountFindingSchema,
  SignContradictionFindingSchema,
  UnrecognizedDocumentFindingSchema,
]);

const PropertyStatementSchema = PropertyStatementFieldsSchema.extend({
  documentKind: z.enum(["notarisafrekening", "wozBeschikking", "makelaarsnota"]),
});

const UnrecognizedDocumentSchema = z.object({
  institution: s(),
  taxYear: n().nullable(),
});

export const AnalysisReportSchema = z.object({
  taxYear: z.number().int(),
  covered: z.array(CoveredItemSchema),
  missingStatement: z.array(MissingStatementItemSchema),
  notFilledIn: z.array(NotFilledInItemSchema),
  propertyStatements: z.array(PropertyStatementSchema),
  findings: z.array(FindingSchema),
  attentionPoints: z.array(AttentionPointSchema),
});

// Narrower schema for the LLM's response — it now only generates attentionPoints
export const LLMAnalysisResponseSchema = z.object({
  attentionPoints: z.array(AttentionPointSchema).catch([]),
});

const ExtractionErrorSchema = z.object({
  filename: z.string(),
  error: z.string(),
});

const FullAnalysisReportSchema = AnalysisReportSchema.extend({
  extractionErrors: z.array(ExtractionErrorSchema),
});

export const ExtractedDataSchema = z.object({
  taxReturn: TaxReturnSchema,
  annualStatements: z.array(AnnualStatementSchema),
  propertyStatements: z.array(PropertyStatementSchema),
  unrecognizedDocuments: z.array(UnrecognizedDocumentSchema),
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
