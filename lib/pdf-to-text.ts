"use client";

import * as pdfjs from "pdfjs-dist";

// Use the CDN worker to avoid bundling ~500kB into the app
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export async function pdfToText(file: File): Promise<string> {
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

function scrubbedText(text: string): string {
  // Only remove 9-digit numbers that immediately follow a BSN label —
  // avoids stripping other 9-digit identifiers (loonheffingsnummer etc.)
  return text.replace(
    /(BSN|Burgerservicenummer)\s*:?\s*\d{9}/gi,
    (match, label) => match.replace(/\d{9}/, "[verwijderd]")
  );
}
