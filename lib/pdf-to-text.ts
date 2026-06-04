"use client";

import * as pdfjs from "pdfjs-dist";
import { buildSharedIbanMaps, applyPrivacyFilter } from "./iban-anonymizer";

// Worker served from public/ — kept in sync with pdfjs-dist via postinstall
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export type { IbanMaps } from "./iban-anonymizer";
export { buildSharedIbanMaps, applyPrivacyFilter } from "./iban-anonymizer";
export { extractTaxYear } from "./tax-year-extractor";

/** Extract raw text from a PDF page by page — no scrubbing */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s{2,}/g, " ");
    pages.push(pageText);
  }
  return pages
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
