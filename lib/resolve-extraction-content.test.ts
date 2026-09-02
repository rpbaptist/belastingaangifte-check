import { describe, expect, it, vi } from "vitest";
import { resolveExtractionContent } from "./extractor";
import type { PdfParserClient } from "./pdf-parser-client";

const PDF_BASE64 = Buffer.from("%PDF-1.4 fake").toString("base64");
const USER_PROMPT = "Extract the structured data from this jaaropgave.";

describe("resolveExtractionContent", () => {
  it("sends the parsed markdown as text when the parser client succeeds", async () => {
    const parserClient: PdfParserClient = { parse: vi.fn().mockResolvedValue("# Jaaropgave") };

    const content = await resolveExtractionContent(PDF_BASE64, USER_PROMPT, parserClient);

    expect(content).toHaveLength(2);
    expect(content[0]).toMatchObject({ type: "text" });
    expect((content[0] as { text: string }).text).toContain("# Jaaropgave");
    expect(content[1]).toEqual({ type: "text", text: USER_PROMPT });
  });

  it("falls back to the raw PDF document block when the parser client throws", async () => {
    const parserClient: PdfParserClient = {
      parse: vi.fn().mockRejectedValue(new Error("Lambda invocation failed with status 500")),
    };

    const content = await resolveExtractionContent(PDF_BASE64, USER_PROMPT, parserClient);

    expect(content).toEqual([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: PDF_BASE64 },
      },
      { type: "text", text: USER_PROMPT },
    ]);
  });

  it("falls back to the raw PDF document block when no parser client is configured", async () => {
    const content = await resolveExtractionContent(PDF_BASE64, USER_PROMPT, undefined);

    expect(content).toEqual([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: PDF_BASE64 },
      },
      { type: "text", text: USER_PROMPT },
    ]);
  });
});
