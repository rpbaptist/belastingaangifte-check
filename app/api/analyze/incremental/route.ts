import { NextRequest, NextResponse } from "next/server";
import { extractStatements } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import type { AnalyseResponse, IncrementalRequest } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: IncrementalRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { extractedData, additionalStatements } = body;

  if (!extractedData?.taxReturn) {
    return NextResponse.json({ error: "Geen eerder geëxtraheerde data ontvangen" }, { status: 400 });
  }
  if (!additionalStatements?.length) {
    return NextResponse.json(
      { error: "Minimaal één aanvullende jaaropgave is vereist" },
      { status: 400 }
    );
  }

  const { results: newStatements, errors: extractionErrors } = await extractStatements(additionalStatements);

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
