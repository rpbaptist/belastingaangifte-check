import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { extractStatements } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import { classifyError } from "@/lib/anthropic-error";
import type { AnalyseResponse, IncrementalRequest } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: IncrementalRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const apiKey = request.headers.get("x-api-key") ?? undefined;
  const { extractedData, additionalStatements } = body;

  if (!extractedData?.taxReturn) {
    return NextResponse.json(
      { error: "Geen eerder geëxtraheerde data ontvangen" },
      { status: 400 }
    );
  }
  if (!additionalStatements?.length) {
    return NextResponse.json(
      { error: "Minimaal één aanvullende jaaropgave is vereist" },
      { status: 400 }
    );
  }

  try {
    const rules = await fs.readFile(
      path.join(process.cwd(), "rules", "aandachtspunten.md"),
      "utf-8"
    );

    const { results: newStatements, errors: extractionErrors } = await extractStatements(
      additionalStatements,
      apiKey
    );

    const mergedStatements = [...extractedData.annualStatements, ...newStatements];

    const reportBase = await analyzeDocuments(
      extractedData.taxReturn,
      mergedStatements,
      rules,
      apiKey
    );

    const response: AnalyseResponse = {
      report: { ...reportBase, extractionErrors },
      extractedData: {
        taxReturn: extractedData.taxReturn,
        annualStatements: mergedStatements,
      },
    };

    return NextResponse.json(response);
  } catch (err) {
    const { status, message } = classifyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
