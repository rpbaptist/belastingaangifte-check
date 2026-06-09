import { describe, expect, it } from "vitest";
import { filterPdfFiles, isPdfFile } from "./file-utils";

function makeFile(name: string, type: string): File {
  return new File([], name, { type });
}

describe("isPdfFile", () => {
  it("accepts a file with application/pdf MIME type", () => {
    expect(isPdfFile(makeFile("doc.pdf", "application/pdf"))).toBe(true);
  });

  it("accepts a file with .pdf extension and no MIME type", () => {
    expect(isPdfFile(makeFile("doc.pdf", ""))).toBe(true);
  });

  it("accepts a file with uppercase .PDF extension", () => {
    expect(isPdfFile(makeFile("DOC.PDF", ""))).toBe(true);
  });

  it("rejects a file that is not a PDF", () => {
    expect(isPdfFile(makeFile("image.png", "image/png"))).toBe(false);
  });
});

describe("filterPdfFiles", () => {
  it("keeps only PDF files from a mixed list", () => {
    const files = [
      makeFile("a.pdf", "application/pdf"),
      makeFile("b.png", "image/png"),
      makeFile("c.pdf", ""),
    ];
    const result = filterPdfFiles(files);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toEqual(["a.pdf", "c.pdf"]);
  });

  it("returns an empty array when no files are PDFs", () => {
    expect(filterPdfFiles([makeFile("a.txt", "text/plain")])).toHaveLength(0);
  });

  it("returns an empty array for an empty input", () => {
    expect(filterPdfFiles([])).toHaveLength(0);
  });
});
