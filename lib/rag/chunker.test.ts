import { describe, expect, it } from "vitest";
import { chunkText } from "./chunker";

describe("chunkText", () => {
  it("returns a single chunk for a short document", () => {
    const chunks = chunkText({
      url: "https://example.org/a",
      title: "Voorbeeldpagina",
      text: "# Voorbeeldpagina\n\nDit is een korte alinea.",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Dit is een korte alinea.");
    expect(chunks[0].sourceUrl).toBe("https://example.org/a");
    expect(chunks[0].sourceTitle).toBe("Voorbeeldpagina");
  });

  it("splits into multiple chunks once paragraphs exceed maxChars", () => {
    const paragraphA = "A".repeat(600);
    const paragraphB = "B".repeat(600);
    const chunks = chunkText(
      {
        url: "https://example.org/b",
        title: "Lang document",
        text: `${paragraphA}\n\n${paragraphB}`,
      },
      { maxChars: 1000 }
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain(paragraphA);
    expect(chunks[1].text).toContain(paragraphB);
  });

  it("carries the current heading into every chunk split from under it", () => {
    const paragraphA = "A".repeat(600);
    const paragraphB = "B".repeat(600);
    const chunks = chunkText(
      {
        url: "https://example.org/c",
        title: "Hypotheekrenteaftrek",
        text: `## Hypotheekrenteaftrek bij aflossingsvrije lening\n\n${paragraphA}\n\n${paragraphB}`,
      },
      { maxChars: 1000 }
    );

    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk.text.startsWith("## Hypotheekrenteaftrek bij aflossingsvrije lening")).toBe(
        true
      );
    }
  });

  it("carries the tail of the previous chunk into the next as overlap", () => {
    const paragraphA = "A".repeat(600);
    const paragraphB = "B".repeat(600);
    const chunks = chunkText(
      { url: "https://example.org/d", title: "Overlap", text: `${paragraphA}\n\n${paragraphB}` },
      { maxChars: 1000, overlapChars: 120 }
    );

    expect(chunks).toHaveLength(2);
    const tailOfFirst = chunks[0].text.slice(-120);
    expect(chunks[1].text.startsWith(tailOfFirst)).toBe(true);
  });

  it("does not duplicate the heading when the overlap tail is the heading itself", () => {
    // A short heading immediately followed by a paragraph that alone overflows maxChars:
    // the heading-only first chunk's overlap tail equals the heading, which must not be
    // prefixed twice into the next chunk.
    const chunks = chunkText(
      {
        url: "https://example.org/e",
        title: "Korte kop",
        text: `## Heading\n\n${"A".repeat(990)}`,
      },
      { maxChars: 1000, overlapChars: 120 }
    );

    expect(chunks[1].text.startsWith("## Heading\n\n## Heading")).toBe(false);
  });
});
