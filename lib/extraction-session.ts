import Anthropic from "@anthropic-ai/sdk";
import { extractAnnualStatement, extractTaxReturn } from "./extractor";
import type { AnnualStatementData, ExtractionError, TaxReturnData } from "./types";
import { isUserFacingError } from "./anthropic-error";

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
  apiKey?: string
): Promise<ExtractionSessionResult> {
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const [taxReturnResult, ...statementResults] = await Promise.allSettled([
    extractTaxReturn(taxReturnPdf, client),
    ...statements.map((s) => extractAnnualStatement(s.data, client)),
  ]);

  if (taxReturnResult.status === "rejected") {
    if (isUserFacingError(taxReturnResult.reason)) throw taxReturnResult.reason;
    const message =
      taxReturnResult.reason instanceof Error ? taxReturnResult.reason.message : "Onbekende fout";
    return { ok: false, message };
  }

  const errors: ExtractionError[] = [];
  const annualStatements = statementResults
    .map((result, i) => {
      if (result.status === "rejected") {
        if (isUserFacingError(result.reason)) throw result.reason;
        errors.push({
          filename: statements[i].filename,
          error: result.reason instanceof Error ? result.reason.message : "Extractie mislukt",
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
  apiKey?: string
): Promise<{ results: AnnualStatementData[]; errors: ExtractionError[] }> {
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const settled = await Promise.allSettled(
    statements.map((s) => extractAnnualStatement(s.data, client))
  );

  const errors: ExtractionError[] = [];
  const results = settled
    .map((result, i) => {
      if (result.status === "rejected") {
        if (isUserFacingError(result.reason)) throw result.reason;
        errors.push({
          filename: statements[i].filename,
          error: result.reason instanceof Error ? result.reason.message : "Extractie mislukt",
        });
        return null;
      }
      return result.value;
    })
    .filter((s): s is AnnualStatementData => s !== null);

  return { results, errors };
}
