"use client";

import * as pdfjs from "pdfjs-dist";

// Worker served from public/ — kept in sync with pdfjs-dist via postinstall
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Extracted text with a reverse map: pseudonym → original normalised IBAN */
export type PdfTextResult = { text: string; ibanMap: Record<string, string> };

export async function pdfToText(file: File): Promise<PdfTextResult> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  return scrubbedText(pages.join("\n"));
}

// Dutch IBAN: NL + 2 check digits + 4-letter bank code + 10 digits, with optional spaces
const IBAN_RE = /\bNL\d{2}\s?[A-Z]{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi;

function normalizeIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

function ibanPseudonym(normalized: string): string {
  // FNV-1a 32-bit hash — deterministic, so same IBAN → same pseudonym across documents
  let h = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `NL-${h.toString(36).toUpperCase().padStart(7, "0").slice(-7)}`;
}

function scrubbedText(raw: string): PdfTextResult {
  const ibanMap: Record<string, string> = {};
  const text = raw
    .replace(IBAN_RE, (match) => {
      const norm = normalizeIban(match);
      const pseudo = ibanPseudonym(norm);
      ibanMap[pseudo] = norm; // reverse: pseudonym → real IBAN
      return pseudo;
    })
    .replace(
      /(BSN|Burgerservicenummer)\s*:?\s*\d{9}/gi,
      (match) => match.replace(/\d{9}/, "[verwijderd]")
    );
  return { text, ibanMap };
}
