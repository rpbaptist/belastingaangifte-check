export async function fileToBase64(file: File): Promise<string> {
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

export interface StatementInput {
  data: string;
  filename: string;
}

// Shared by both analyze routes: form-data entries arrive as FormDataEntryValue (string | File),
// so only the File ones are real uploads worth base64-encoding for extraction.
export async function filesToStatementInputs(
  files: FormDataEntryValue[]
): Promise<StatementInput[]> {
  return Promise.all(
    files
      .filter((f): f is File => f instanceof File)
      .map(async (f) => ({ data: await fileToBase64(f), filename: f.name }))
  );
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function filterPdfFiles(files: File[]): File[] {
  return files.filter(isPdfFile);
}
