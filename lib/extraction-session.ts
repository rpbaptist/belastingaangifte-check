import { extractStatement, extractTaxReturn } from "./extractor";
import type {
  AnnualStatementData,
  ExtractionError,
  PropertyStatementData,
  StatementExtraction,
  TaxReturnData,
  UnrecognizedDocument,
} from "./types";
import { isUserFacingError } from "./anthropic-error";
import { createClient } from "./llm";
import { formatTaxReturnProcessingError, translate, type Language } from "./translations";
import type { StatementInput } from "./file-utils";

type SplitStatements = {
  annualStatements: AnnualStatementData[];
  propertyStatements: PropertyStatementData[];
  unrecognizedDocuments: UnrecognizedDocument[];
};

// One extraction call per bewijsstuk self-classifies (lib/prompts/statement.ts), so the
// three outcomes are split back apart here rather than force-fit into a single shape.
export function splitStatements(extractions: StatementExtraction[]): SplitStatements {
  const annualStatements: AnnualStatementData[] = [];
  const propertyStatements: PropertyStatementData[] = [];
  const unrecognizedDocuments: UnrecognizedDocument[] = [];

  for (const extraction of extractions) {
    switch (extraction.documentKind) {
      case "jaaropgave":
        annualStatements.push(extraction.annualStatement);
        break;
      case "unrecognized":
        unrecognizedDocuments.push({
          institution: extraction.institution,
          taxYear: extraction.taxYear,
        });
        break;
      default:
        propertyStatements.push(extraction.propertyStatement);
        break;
    }
  }

  return { annualStatements, propertyStatements, unrecognizedDocuments };
}

export type ExtractionSessionResult =
  | ({
      ok: true;
      taxReturn: TaxReturnData;
      errors: ExtractionError[];
    } & SplitStatements)
  | { ok: false; message: string };

export function formatSessionFailure(
  fileName: string,
  result: Extract<ExtractionSessionResult, { ok: false }>,
  language: Language
): { status: number; message: string } {
  return {
    status: 422,
    message: formatTaxReturnProcessingError(fileName, result.message, language),
  };
}

// Shared by runExtractionSession and extractStatements: turns settled statement
// extractions into the successful StatementExtraction list, routing rejections into
// errors (and rethrowing user-facing ones) rather than failing the whole batch.
function collectStatementResults(
  results: PromiseSettledResult<StatementExtraction>[],
  statements: StatementInput[],
  language: Language
): { extractions: StatementExtraction[]; errors: ExtractionError[] } {
  const errors: ExtractionError[] = [];
  const extractions = results
    .map((result, i) => {
      if (result.status === "rejected") {
        if (isUserFacingError(result.reason)) throw result.reason;
        errors.push({
          filename: statements[i].filename,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : translate("extractionFailedShort", language),
        });
        return null;
      }
      return result.value;
    })
    .filter((s): s is StatementExtraction => s !== null);

  return { extractions, errors };
}

export async function runExtractionSession(
  taxReturnPdf: string,
  statements: StatementInput[],
  apiKey?: string,
  language: Language = "nl"
): Promise<ExtractionSessionResult> {
  const client = createClient(apiKey);
  const [taxReturnResult, ...statementResults] = await Promise.allSettled([
    extractTaxReturn(taxReturnPdf, client, language),
    ...statements.map((s) => extractStatement(s.data, client, language)),
  ]);

  if (taxReturnResult.status === "rejected") {
    if (isUserFacingError(taxReturnResult.reason)) throw taxReturnResult.reason;
    const message =
      taxReturnResult.reason instanceof Error
        ? taxReturnResult.reason.message
        : translate("unknownError", language);
    return { ok: false, message };
  }

  const { extractions, errors } = collectStatementResults(statementResults, statements, language);

  return { ok: true, taxReturn: taxReturnResult.value, ...splitStatements(extractions), errors };
}

export async function extractStatements(
  statements: StatementInput[],
  apiKey?: string,
  language: Language = "nl"
): Promise<SplitStatements & { errors: ExtractionError[] }> {
  const client = createClient(apiKey);
  const settled = await Promise.allSettled(
    statements.map((s) => extractStatement(s.data, client, language))
  );

  const { extractions, errors } = collectStatementResults(settled, statements, language);

  return { ...splitStatements(extractions), errors };
}
