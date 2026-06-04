"use client";

import * as pdfjs from "pdfjs-dist";
import { IBAN_RE, normalizeIban, buildSharedIbanMaps, applyPrivacyFilter } from "./iban-anonymizer";

// Worker served from public/ — kept in sync with pdfjs-dist via postinstall
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export type { IbanMaps } from "./iban-anonymizer";
export { buildSharedIbanMaps, applyPrivacyFilter } from "./iban-anonymizer";

/** Extract raw text from a PDF page by page — no scrubbing */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages.join("\n");
}
