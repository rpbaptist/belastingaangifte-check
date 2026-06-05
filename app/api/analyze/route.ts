import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { runExtractionSession } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import { classifyError } from "@/lib/anthropic-error";
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

  const apiKey = request.headers.get("x-api-key") ?? undefined;
  const { taxReturn, taxReturnFilename, annualStatements } = body;

  if (!taxReturn) {
    return NextResponse.json({ error: "Geen aangifte ontvangen" }, { status: 400 });
  }
  if (!annualStatements?.length) {
    return NextResponse.json({ error: "Minimaal één jaaropgave is vereist" }, { status: 400 });
  }

  try {
    const rules = await fs.readFile(
      path.join(process.cwd(), "rules", "aandachtspunten.md"),
      "utf-8"
    );
    const session = await runExtractionSession(taxReturn, annualStatements, apiKey);

    if (!session.ok) {
      return NextResponse.json(
        { error: `Aangifte "${taxReturnFilename}" kon niet worden verwerkt: ${session.message}` },
        { status: 422 }
      );
    }

    const reportBase = await analyzeDocuments(
      session.taxReturn,
      session.annualStatements,
      rules,
      apiKey
    );

    const response: AnalyseResponse = {
      report: { ...reportBase, extractionErrors: session.errors },
      extractedData: {
        taxReturn: session.taxReturn,
        annualStatements: session.annualStatements,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    const { status, message } = classifyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
