export interface RawDocument {
  url: string;
  title: string;
  text: string;
}

export interface TextChunk {
  sourceUrl: string;
  sourceTitle: string;
  text: string;
}

const DEFAULT_MAX_CHARS = 1000;
const DEFAULT_OVERLAP_CHARS = 120;

export const HEADING_PATTERN = /^#{1,6}\s/;

// Splits a paragraph longer than maxChars into fragments that fit within it, so
// the main loop below never sees a single unit of text it can't bound. Cuts at
// the whitespace nearest to maxChars (never past it) to avoid breaking a word;
// falls back to a hard cut at exactly maxChars when no whitespace is in range —
// sentence-aware splitting would need a dependency or a hand-rolled sentence
// splitter, for a fallback path the current corpus never even exercises.
function splitOversizedParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];

  const fragments: string[] = [];
  let rest = paragraph;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const whitespaceMatches = [...window.matchAll(/\s/g)];
    const cut = whitespaceMatches.at(-1)?.index ?? maxChars;
    fragments.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  fragments.push(rest);

  return fragments.filter((f) => f.length > 0);
}

// Starts a new chunk that continues a section: carries the section's heading and a
// tail of overlap from the previous chunk, so the new chunk reads standalone. The
// overlap is taken only from text after the section's heading — when the section
// opened mid-chunk, anything before it belongs to the previous section.
function buildContinuationStart(
  previousChunk: string,
  heading: string | null,
  paragraph: string,
  overlapChars: number
): string {
  const sectionStart = heading ? previousChunk.lastIndexOf(heading) : -1;
  const sectionBody =
    heading && sectionStart >= 0
      ? previousChunk.slice(sectionStart + heading.length)
      : previousChunk;
  const overlap = sectionBody.slice(-overlapChars).trim();
  return [heading, overlap, paragraph].filter((part) => part).join("\n\n");
}

// A paragraph, or — when it opens a section — the heading run before it plus the
// paragraph. `sectionHeading` is the last heading of that run; null on a unit that
// continues a section.
interface TextUnit {
  text: string;
  sectionHeading: string | null;
}

// Joins each heading — or run of consecutive headings — to the paragraph that follows
// it, so the loop in chunkText only ever sees a heading together with its body and can
// never flush one alone or leave one trailing at the end of a chunk. A heading run with
// no paragraph after it (end of document) carries no content and is dropped.
function attachHeadings(paragraphs: string[]): TextUnit[] {
  const units: TextUnit[] = [];
  let pendingHeadings: string[] = [];
  for (const paragraph of paragraphs) {
    if (HEADING_PATTERN.test(paragraph)) {
      pendingHeadings.push(paragraph);
    } else {
      units.push({
        text: [...pendingHeadings, paragraph].join("\n\n"),
        sectionHeading: pendingHeadings.at(-1) ?? null,
      });
      pendingHeadings = [];
    }
  }
  return units;
}

export function chunkText(
  doc: RawDocument,
  opts: { maxChars?: number; overlapChars?: number } = {}
): TextChunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const units = attachHeadings(
    doc.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .flatMap((p) => splitOversizedParagraph(p, maxChars))
  );

  const chunks: TextChunk[] = [];
  let current = "";
  let currentHeading: string | null = null;

  const flush = () => {
    if (current) {
      chunks.push({ sourceUrl: doc.url, sourceTitle: doc.title, text: current });
    }
  };

  for (const unit of units) {
    if (unit.sectionHeading) currentHeading = unit.sectionHeading;

    const candidate = current ? `${current}\n\n${unit.text}` : unit.text;
    if (current && candidate.length > maxChars) {
      // A new section brings its own heading; overlap from the previous section would
      // only put that section's text under the wrong heading.
      const nextStart = unit.sectionHeading
        ? unit.text
        : buildContinuationStart(current, currentHeading, unit.text, overlapChars);
      flush();
      current = nextStart;
    } else {
      current = candidate;
    }
  }
  flush();

  return chunks;
}
