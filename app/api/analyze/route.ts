import { NextRequest, NextResponse } from "next/server";
import { extractAnnualStatement, extractTaxReturn } from "@/lib/extractor";
import { analyzeDocuments } from "@/lib/analyzer";
import type { AnalyseRequest, AnalyseResponse, ExtractionError } from "@/lib/types";

// Allow up to 300s — parallel extraction + analysis across many PDFs
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: AnalyseRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { taxReturn, taxReturnFilename, annualStatements } = body;

  if (!taxReturn) {
    return NextResponse.json({ error: "taxReturn is required" }, { status: 400 });
  }
  if (!annualStatements?.length) {
    return NextResponse.json(
      { error: "At least one annualStatement is required" },
      { status: 400 }
    );
  }

  // Extract aangifte and all jaaropgaves in parallel
  const [taxReturnResult, ...statementResults] = await Promise.allSettled([
    extractTaxReturn(taxReturn),
    ...annualStatements.map((s) => extractAnnualStatement(s.data)),
  ]);

  // Aangifte failure is fatal — nothing to compare against
  if (taxReturnResult.status === "rejected") {
    const message =
      taxReturnResult.reason instanceof Error ? taxReturnResult.reason.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Could not extract belastingaangifte "${taxReturnFilename}": ${message}`,
      },
      { status: 422 }
    );
  }

  // Collect partial failures for jaaropgaves — keep going with what succeeded
  const extractionErrors: ExtractionError[] = [];
  const successfulStatements = statementResults
    .map((result, i) => {
      if (result.status === "rejected") {
        extractionErrors.push({
          filename: annualStatements[i].filename,
          error: result.reason instanceof Error ? result.reason.message : "Extraction failed",
        });
        return null;
      }
      return result.value;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const reportBase = await analyzeDocuments(taxReturnResult.value, successfulStatements);

  const response: AnalyseResponse = {
    report: {
      ...reportBase,
      extractionErrors,
    },
  };

  return NextResponse.json(response);
}
