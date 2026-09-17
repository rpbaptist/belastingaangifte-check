import { NextRequest, NextResponse } from "next/server";
import { extractStatements } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import { classifyError } from "@/lib/anthropic-error";
import { ExtractedDataSchema } from "@/lib/schemas";
import type { ExtractedData } from "@/lib/types";
import { filesToStatementInputs } from "@/lib/file-utils";
import { translate, type Language } from "@/lib/translations";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const language: Language = request.headers.get("x-language") === "en" ? "en" : "nl";

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: translate("invalidRequest", language) }, { status: 400 });
  }

  const apiKey = request.headers.get("x-api-key") ?? undefined;
  const extractedDataRaw = formData.get("extractedData");
  const statementFiles = formData.getAll("annualStatements");

  if (typeof extractedDataRaw !== "string") {
    return NextResponse.json(
      { error: translate("noEarlierExtractedDataReceived", language) },
      { status: 400 }
    );
  }
  if (!statementFiles.length) {
    return NextResponse.json(
      { error: translate("atLeastOneAdditionalStatementRequired", language) },
      { status: 400 }
    );
  }

  let extractedData: ExtractedData;
  try {
    extractedData = ExtractedDataSchema.parse(JSON.parse(extractedDataRaw));
  } catch {
    return NextResponse.json(
      { error: translate("invalidExtractedData", language) },
      { status: 400 }
    );
  }

  try {
    const additionalStatements = await filesToStatementInputs(statementFiles);

    const {
      annualStatements: newStatements,
      propertyStatements: newPropertyStatements,
      unrecognizedDocuments: newUnrecognizedDocuments,
      errors: extractionErrors,
    } = await extractStatements(additionalStatements, apiKey, language);

    const mergedStatements = [...extractedData.annualStatements, ...newStatements];
    const mergedPropertyStatements = [...extractedData.propertyStatements, ...newPropertyStatements];
    const mergedUnrecognizedDocuments = [
      ...extractedData.unrecognizedDocuments,
      ...newUnrecognizedDocuments,
    ];

    const reportBase = await analyzeDocuments(
      extractedData.taxReturn,
      mergedStatements,
      mergedPropertyStatements,
      mergedUnrecognizedDocuments,
      apiKey,
      language
    );
    return NextResponse.json({
      report: { ...reportBase, extractionErrors },
      extractedData: {
        taxReturn: extractedData.taxReturn,
        annualStatements: mergedStatements,
        propertyStatements: mergedPropertyStatements,
        unrecognizedDocuments: mergedUnrecognizedDocuments,
      },
    });
  } catch (err) {
    const { status, message } = classifyError(err, language);
    return NextResponse.json({ error: message }, { status });
  }
}
