"use client";

import * as pdfjs from "pdfjs-dist";

// Worker served from public/ — kept in sync with pdfjs-dist via postinstall
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Forward map (normalised IBAN → pseudonym) and reverse map (pseudonym → normalised IBAN) */
export type IbanMaps = {
  forward: Record<string, string>;
  reverse: Record<string, string>;
};

// Dutch IBAN: NL + 2 check digits + 4-letter bank code + 10 digits, with optional spaces
const IBAN_RE = /\bNL\d{2}\s?[A-Z]{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi;

function normalizeIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

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

/**
 * Build (or extend) a shared IBAN map from one or more raw texts.
 * Pseudonym format: [IBAN:BANKCODE:NNN] — the LLM can read institution context directly
 * without needing to infer it from an opaque hash.
 * Pass `existing` when adding new documents to an already-running session.
 */
export function buildSharedIbanMaps(
  rawTexts: string[],
  existing: IbanMaps = { forward: {}, reverse: {} }
): IbanMaps {
  const forward = { ...existing.forward };
  const reverse = { ...existing.reverse };

  // Seed per-bank counters from existing pseudonyms so new ones don't collide
  const counters: Record<string, number> = {};
  for (const pseudo of Object.values(forward)) {
    const m = pseudo.match(/^\[IBAN:([A-Z]{4}):(\d{3})\]$/);
    if (m) counters[m[1]] = Math.max(counters[m[1]] ?? 0, parseInt(m[2], 10));
  }

  for (const text of rawTexts) {
    for (const match of text.match(new RegExp(IBAN_RE.source, "gi")) ?? []) {
      const norm = normalizeIban(match);
      if (forward[norm]) continue; // already mapped
      const code = norm.slice(4, 8); // bank code, e.g. "INGB", "RABO", "ASNB"
      counters[code] = (counters[code] ?? 0) + 1;
      const pseudo = `[IBAN:${code}:${counters[code].toString().padStart(3, "0")}]`;
      forward[norm] = pseudo;
      reverse[pseudo] = norm;
    }
  }

  return { forward, reverse };
}

/** Apply the forward IBAN map and BSN scrub to raw text */
export function applyPrivacyFilter(rawText: string, forward: Record<string, string>): string {
  return rawText
    .replace(new RegExp(IBAN_RE.source, "gi"), (match) => forward[normalizeIban(match)] ?? match)
    .replace(
      /(BSN|Burgerservicenummer)\s*:?\s*\d{9}/gi,
      (match) => match.replace(/\d{9}/, "[verwijderd]")
    );
}
