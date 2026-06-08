import { NextRequest, NextResponse } from "next/server";
import { extractStatements } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import { classifyError } from "@/lib/anthropic-error";
import { ExtractedDataSchema } from "@/lib/schemas";
import type { ExtractedData } from "@/lib/types";
import { fileToBase64 } from "@/lib/file-utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const apiKey = request.headers.get("x-api-key") ?? undefined;
  const extractedDataRaw = formData.get("extractedData");
  const statementFiles = formData.getAll("annualStatements");

  if (typeof extractedDataRaw !== "string") {
    return NextResponse.json(
      { error: "Geen eerder geëxtraheerde data ontvangen" },
      { status: 400 }
    );
  }
  if (!statementFiles.length) {
    return NextResponse.json(
      { error: "Minimaal één aanvullende jaaropgave is vereist" },
      { status: 400 }
    );
  }

  let extractedData: ExtractedData;
  try {
    extractedData = ExtractedDataSchema.parse(JSON.parse(extractedDataRaw));
  } catch {
    return NextResponse.json({ error: "Ongeldige geëxtraheerde data" }, { status: 400 });
  }

  try {
    const additionalStatements = await Promise.all(
      statementFiles
        .filter((f): f is File => f instanceof File)
        .map(async (f) => ({ data: await fileToBase64(f), filename: f.name }))
    );

    const { results: newStatements, errors: extractionErrors } = await extractStatements(
      additionalStatements,
      apiKey
    );

    const mergedStatements = [...extractedData.annualStatements, ...newStatements];

    const reportBase = await analyzeDocuments(extractedData.taxReturn, mergedStatements, apiKey);
    return NextResponse.json({
      report: { ...reportBase, extractionErrors },
      extractedData: { taxReturn: extractedData.taxReturn, annualStatements: mergedStatements },
    });
  } catch (err) {
    const { status, message } = classifyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
