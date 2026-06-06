import { analyzeDocuments } from "./analyzer";
import type { AnalyseResponse, AnnualStatementData, ExtractionError, TaxReturnData } from "./types";

export async function runAnalysis(
  taxReturn: TaxReturnData,
  annualStatements: AnnualStatementData[],
  extractionErrors: ExtractionError[],
  apiKey?: string
): Promise<AnalyseResponse> {
  const reportBase = await analyzeDocuments(taxReturn, annualStatements, apiKey);
  return {
    report: { ...reportBase, extractionErrors },
    extractedData: { taxReturn, annualStatements },
  };
}
