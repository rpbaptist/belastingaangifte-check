export async function fileToBase64(file: File): Promise<string> {
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function filterPdfFiles(files: File[]): File[] {
  return files.filter(isPdfFile);
}
