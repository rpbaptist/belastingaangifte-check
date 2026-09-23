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

  it("splits into multiple chunks once paragraphs exceed targetChars", () => {
    const paragraphA = "A".repeat(600);
    const paragraphB = "B".repeat(600);
    const chunks = chunkText(
      {
        url: "https://example.org/b",
        title: "Lang document",
        text: `${paragraphA}\n\n${paragraphB}`,
      },
      { targetChars: 1000 }
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
      { targetChars: 1000 }
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
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks).toHaveLength(2);
    const tailOfFirst = chunks[0].text.slice(-120);
    expect(chunks[1].text.startsWith(tailOfFirst)).toBe(true);
  });

  it("keeps a heading with its body when the paragraph under it alone overflows targetChars", () => {
    const chunks = chunkText(
      {
        url: "https://example.org/e",
        title: "Korte kop",
        text: `## Heading\n\n${"A".repeat(990)}`,
      },
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(`## Heading\n\n${"A".repeat(990)}`);
  });

  it("moves a heading that would end a full chunk into the next chunk, with its body", () => {
    const paragraphA = "A".repeat(600);
    const paragraphB = "B".repeat(600);
    const chunks = chunkText(
      {
        url: "https://example.org/e2",
        title: "Nieuwe sectie",
        text: `${paragraphA}\n\n## Nieuwe sectie\n\n${paragraphB}`,
      },
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe(paragraphA);
    expect(chunks[1].text).toContain(`## Nieuwe sectie\n\n${paragraphB}`);
  });

  it("starts a chunk that opens a new section without overlap from the previous section", () => {
    const paragraphA = "A".repeat(600);
    const paragraphB = "B".repeat(600);
    const chunks = chunkText(
      {
        url: "https://example.org/e3",
        title: "Sectiegrens",
        text: `## Eerste sectie\n\n${paragraphA}\n\n## Tweede sectie\n\n${paragraphB}`,
      },
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[1].text).toBe(`## Tweede sectie\n\n${paragraphB}`);
  });

  it("takes continuation overlap only from the current section when it opened mid-chunk", () => {
    const chunks = chunkText(
      {
        url: "https://example.org/e6",
        title: "Sectie halverwege",
        text: `## Eerste sectie\n\n${"A".repeat(500)}\n\n## Tweede sectie\n\nKort.\n\n${"C".repeat(600)}`,
      },
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[1].text).toBe(`## Tweede sectie\n\nKort.\n\n${"C".repeat(600)}`);
  });

  it("keeps a run of consecutive headings together with the paragraph under them", () => {
    const paragraphA = "A".repeat(600);
    const paragraphB = "B".repeat(600);
    const chunks = chunkText(
      {
        url: "https://example.org/e4",
        title: "Geneste koppen",
        text: `${paragraphA}\n\n## Hoofdstuk\n\n### Paragraaf\n\n${paragraphB}`,
      },
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe(paragraphA);
    expect(chunks[1].text).toBe(`## Hoofdstuk\n\n### Paragraaf\n\n${paragraphB}`);
  });

  it("drops a heading with no body after it at the end of the document", () => {
    const chunks = chunkText(
      {
        url: "https://example.org/e5",
        title: "Loze kop",
        text: `## Uitleg\n\nKorte alinea.\n\n## Actueel`,
      },
      { targetChars: 1000 }
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("## Uitleg\n\nKorte alinea.");
  });

  it("splits a single oversized paragraph with no blank line at the nearest whitespace", () => {
    // One long paragraph, no blank line anywhere in it, well past targetChars.
    const text = Array(200).fill("aftrekpost").join(" ");
    const chunks = chunkText(
      { url: "https://example.org/f", title: "Aaneengesloten alinea", text },
      { targetChars: 1000 }
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.length).toBeLessThanOrEqual(1000);
    // The cut landed on whitespace, not mid-word: the first chunk is an exact
    // prefix of the source text, and the very next character is whitespace.
    expect(text.startsWith(chunks[0].text)).toBe(true);
    expect(text[chunks[0].text.length]).toMatch(/\s/);
  });

  it("hard-cuts at targetChars when the oversized paragraph has no whitespace to split on", () => {
    const text = "a".repeat(1500); // one unbroken token, no whitespace anywhere
    const chunks = chunkText(
      { url: "https://example.org/g", title: "Ononderbroken token", text },
      { targetChars: 1000 }
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toBe("a".repeat(1000));
  });

  it("carries the heading into every chunk produced by splitting an oversized paragraph", () => {
    const bigParagraph = Array(200).fill("aftrekpost").join(" ");
    const chunks = chunkText(
      {
        url: "https://example.org/h",
        title: "Aftrekposten",
        text: `## Aftrekposten\n\n${bigParagraph}`,
      },
      { targetChars: 1000 }
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.startsWith("## Aftrekposten")).toBe(true);
    }
  });

  it("carries only the heading line, not the section's first body, into continuation chunks", () => {
    // Numbered words, so every position in the paragraph is distinguishable.
    const bigParagraph = Array.from({ length: 200 }, (_, i) => `post${i}`).join(" ");
    const chunks = chunkText(
      {
        url: "https://example.org/h2",
        title: "Aftrekposten",
        text: `## Aftrekposten\n\n${bigParagraph}`,
      },
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks.length).toBeGreaterThan(1);
    const tailOfFirst = chunks[0].text.slice(-120).trim();
    expect(chunks[1].text.startsWith(`## Aftrekposten\n\n${tailOfFirst}`)).toBe(true);
  });

  it("carries overlap between chunks produced by splitting the same oversized paragraph", () => {
    const bigParagraph = Array(200).fill("aftrekpost").join(" ");
    const chunks = chunkText(
      { url: "https://example.org/i", title: "Overlap binnen alinea", text: bigParagraph },
      { targetChars: 1000, overlapChars: 120 }
    );

    expect(chunks.length).toBeGreaterThan(1);
    const tailOfFirst = chunks[0].text.slice(-120);
    expect(chunks[1].text.startsWith(tailOfFirst)).toBe(true);
  });

  // targetChars is a soft target, not a hard ceiling (issue #95): a chunk that starts
  // a new section or continues one gets its heading and/or overlap tail prepended to a
  // fragment that was itself already sized up to targetChars, so the result can run
  // over. These two tests pin the documented bound on chunkText — see the doc comment
  // there — and show it is genuinely exceeded, not just theoretically possible, so a
  // future switch to a hard ceiling has to update both the tests and the docs.
  it("stays within the documented bound when a heading precedes an oversized paragraph", () => {
    const targetChars = 1000;
    const overlapChars = 120;
    const heading = "## Aftrekposten";
    const paragraph = Array.from({ length: 350 }, (_, i) => `aftrekpost${i}`).join(" ");

    const chunks = chunkText(
      {
        url: "https://example.org/j",
        title: "Kop met lange alinea",
        text: `${heading}\n\n${paragraph}`,
      },
      { targetChars, overlapChars }
    );

    expect(chunks.length).toBeGreaterThan(1);
    const bound = targetChars + heading.length + overlapChars + 4;
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(bound);
    }
    expect(chunks.some((chunk) => chunk.text.length > targetChars)).toBe(true);
  });

  it("stays within the documented bound when overlap alone pushes a chunk over target", () => {
    const targetChars = 1000;
    const overlapChars = 120;
    const paragraphA = Array.from({ length: 165 }, (_, i) => `woordA${i}`).join(" ");
    const paragraphB = Array.from({ length: 165 }, (_, i) => `woordB${i}`).join(" ");

    const chunks = chunkText(
      {
        url: "https://example.org/k",
        title: "Twee lange alineas",
        text: `${paragraphA}\n\n${paragraphB}`,
      },
      { targetChars, overlapChars }
    );

    expect(chunks.length).toBeGreaterThan(1);
    const bound = targetChars + overlapChars + 4;
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(bound);
    }
    expect(chunks.some((chunk) => chunk.text.length > targetChars)).toBe(true);
  });
});
