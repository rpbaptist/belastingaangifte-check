import { NextRequest, NextResponse } from "next/server";
import { runExtractionSession } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import { classifyError } from "@/lib/anthropic-error";
import { fileToBase64 } from "@/lib/file-utils";
import { translate, formatTaxReturnProcessingError, type Language } from "@/lib/translations";

// Allow up to 300s — parallel extraction + analysis across many PDFs
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
  const taxReturnFile = formData.get("taxReturn");
  const statementFiles = formData.getAll("annualStatements");

  if (!(taxReturnFile instanceof File)) {
    return NextResponse.json(
      { error: translate("noTaxReturnReceived", language) },
      { status: 400 }
    );
  }
  if (!statementFiles.length) {
    return NextResponse.json(
      { error: translate("atLeastOneStatementRequired", language) },
      { status: 400 }
    );
  }

  try {
    const taxReturnBase64 = await fileToBase64(taxReturnFile);
    const statements = await Promise.all(
      statementFiles
        .filter((f): f is File => f instanceof File)
        .map(async (f) => ({ data: await fileToBase64(f), filename: f.name }))
    );

    const session = await runExtractionSession(taxReturnBase64, statements, apiKey, language);

    if (!session.ok) {
      return NextResponse.json(
        {
          error: formatTaxReturnProcessingError(taxReturnFile.name, session.message, language),
        },
        { status: 422 }
      );
    }

    const reportBase = await analyzeDocuments(
      session.taxReturn,
      session.annualStatements,
      apiKey,
      language
    );
    return NextResponse.json({
      report: { ...reportBase, extractionErrors: session.errors },
      extractedData: { taxReturn: session.taxReturn, annualStatements: session.annualStatements },
    });
  } catch (err) {
    const { status, message } = classifyError(err, language);
    return NextResponse.json({ error: message }, { status });
  }
}
