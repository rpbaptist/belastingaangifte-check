import { NextRequest, NextResponse } from "next/server";
import { runExtractionSession } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import type { AnalyseRequest, AnalyseResponse } from "@/lib/types";

// Allow up to 300s — parallel extraction + analysis across many PDFs
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: AnalyseRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { taxReturn, taxReturnFilename, annualStatements } = body;

  if (!taxReturn) {
    return NextResponse.json({ error: "Geen aangifte ontvangen" }, { status: 400 });
  }
  if (!annualStatements?.length) {
    return NextResponse.json(
      { error: "Minimaal één jaaropgave is vereist" },
      { status: 400 }
    );
  }

  const session = await runExtractionSession(taxReturn, annualStatements);

  if (!session.ok) {
    return NextResponse.json(
      { error: `Aangifte "${taxReturnFilename}" kon niet worden verwerkt: ${session.message}` },
      { status: 422 }
    );
  }

  const reportBase = await analyzeDocuments(session.taxReturn, session.annualStatements);

  const response: AnalyseResponse = {
    report: { ...reportBase, extractionErrors: session.errors },
    extractedData: {
      taxReturn: session.taxReturn,
      annualStatements: session.annualStatements,
    },
  };

  return NextResponse.json(response);
}
