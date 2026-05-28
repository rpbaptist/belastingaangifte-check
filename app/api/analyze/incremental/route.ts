import { NextRequest, NextResponse } from "next/server";
import { extractAnnualStatement } from "@/lib/extractor";
import { analyzeDocuments } from "@/lib/analyzer";
import type { AnalyseResponse, ExtractionError, IncrementalRequest } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: IncrementalRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { extractedData, additionalStatements } = body;

  if (!extractedData?.taxReturn) {
    return NextResponse.json({ error: "extractedData is required" }, { status: 400 });
  }
  if (!additionalStatements?.length) {
    return NextResponse.json(
      { error: "At least one additionalStatement is required" },
      { status: 400 }
    );
  }

  const results = await Promise.allSettled(
    additionalStatements.map((s) => extractAnnualStatement(s.data))
  );

  const extractionErrors: ExtractionError[] = [];
  const newStatements = results
    .map((result, i) => {
      if (result.status === "rejected") {
        extractionErrors.push({
          filename: additionalStatements[i].filename,
          error:
            result.reason instanceof Error ? result.reason.message : "Extraction failed",
        });
        return null;
      }
      return result.value;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const mergedStatements = [...extractedData.annualStatements, ...newStatements];

  const reportBase = await analyzeDocuments(extractedData.taxReturn, mergedStatements);

  const response: AnalyseResponse = {
    report: { ...reportBase, extractionErrors },
    extractedData: {
      taxReturn: extractedData.taxReturn,
      annualStatements: mergedStatements,
    },
  };

  return NextResponse.json(response);
}
