import { extractAnnualStatement, extractTaxReturn } from "./extractor";
import type { AnnualStatementData, ExtractionError, TaxReturnData } from "./types";
import { isUserFacingError } from "./anthropic-error";
import { createClient } from "./llm";
import { translate, type Language } from "./translations";

type StatementInput = { data: string; filename: string };

export type ExtractionSessionResult =
  | {
      ok: true;
      taxReturn: TaxReturnData;
      annualStatements: AnnualStatementData[];
      errors: ExtractionError[];
    }
  | { ok: false; message: string };

export async function runExtractionSession(
  taxReturnPdf: string,
  statements: StatementInput[],
  apiKey?: string,
  language: Language = "nl"
): Promise<ExtractionSessionResult> {
  const client = createClient(apiKey);
  const [taxReturnResult, ...statementResults] = await Promise.allSettled([
    extractTaxReturn(taxReturnPdf, client, language),
    ...statements.map((s) => extractAnnualStatement(s.data, client, language)),
  ]);

  if (taxReturnResult.status === "rejected") {
    if (isUserFacingError(taxReturnResult.reason)) throw taxReturnResult.reason;
    const message =
      taxReturnResult.reason instanceof Error
        ? taxReturnResult.reason.message
        : translate("unknownError", language);
    return { ok: false, message };
  }

  const errors: ExtractionError[] = [];
  const annualStatements = statementResults
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
    .filter((s): s is AnnualStatementData => s !== null);

  return { ok: true, taxReturn: taxReturnResult.value, annualStatements, errors };
}

export async function extractStatements(
  statements: StatementInput[],
  apiKey?: string,
  language: Language = "nl"
): Promise<{ results: AnnualStatementData[]; errors: ExtractionError[] }> {
  const client = createClient(apiKey);
  const settled = await Promise.allSettled(
    statements.map((s) => extractAnnualStatement(s.data, client, language))
  );

  const errors: ExtractionError[] = [];
  const results = settled
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
    .filter((s): s is AnnualStatementData => s !== null);

  return { results, errors };
}
