import { NextRequest, NextResponse } from "next/server";
import { runExtractionSession } from "@/lib/extraction-session";
import { analyzeDocuments } from "@/lib/analyzer";
import { classifyError } from "@/lib/anthropic-error";

// Allow up to 300s — parallel extraction + analysis across many PDFs
export const maxDuration = 300;

async function fileToBase64(file: File): Promise<string> {
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const apiKey = request.headers.get("x-api-key") ?? undefined;
  const taxReturnFile = formData.get("taxReturn");
  const statementFiles = formData.getAll("annualStatements");

  if (!(taxReturnFile instanceof File)) {
    return NextResponse.json({ error: "Geen aangifte ontvangen" }, { status: 400 });
  }
  if (!statementFiles.length) {
    return NextResponse.json({ error: "Minimaal één jaaropgave is vereist" }, { status: 400 });
  }

  try {
    const taxReturnBase64 = await fileToBase64(taxReturnFile);
    const statements = await Promise.all(
      statementFiles
        .filter((f): f is File => f instanceof File)
        .map(async (f) => ({ data: await fileToBase64(f), filename: f.name }))
    );

    const session = await runExtractionSession(taxReturnBase64, statements, apiKey);

    if (!session.ok) {
      return NextResponse.json(
        { error: `Aangifte "${taxReturnFile.name}" kon niet worden verwerkt: ${session.message}` },
        { status: 422 }
      );
    }

    const reportBase = await analyzeDocuments(session.taxReturn, session.annualStatements, apiKey);
    return NextResponse.json({
      report: { ...reportBase, extractionErrors: session.errors },
      extractedData: { taxReturn: session.taxReturn, annualStatements: session.annualStatements },
    });
  } catch (err) {
    const { status, message } = classifyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
