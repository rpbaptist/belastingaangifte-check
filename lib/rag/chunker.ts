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

const HEADING_PATTERN = /^#{1,6}\s/;

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

// Starts a new chunk carrying its owning heading and a tail of overlap from the
// previous chunk, so the new chunk reads standalone — but never duplicates text
// that's identical to the heading (e.g. a heading immediately followed by an
// overflowing paragraph, where the "overlap" would just be the heading again).
function buildChunkStart(
  previousChunk: string,
  heading: string,
  paragraph: string,
  overlapChars: number
): string {
  const overlap = previousChunk.slice(-overlapChars);
  const prefixParts: string[] = [];
  if (heading && heading !== paragraph) prefixParts.push(heading);
  if (overlap && overlap !== heading) prefixParts.push(overlap);
  prefixParts.push(paragraph);
  return prefixParts.join("\n\n");
}

export function chunkText(
  doc: RawDocument,
  opts: { maxChars?: number; overlapChars?: number } = {}
): TextChunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const paragraphs = doc.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .flatMap((p) => splitOversizedParagraph(p, maxChars));

  const chunks: TextChunk[] = [];
  let current = "";
  let currentHeading = "";

  const flush = () => {
    if (current) {
      chunks.push({ sourceUrl: doc.url, sourceTitle: doc.title, text: current });
    }
  };

  for (const paragraph of paragraphs) {
    if (HEADING_PATTERN.test(paragraph)) currentHeading = paragraph;

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && candidate.length > maxChars) {
      const nextStart = buildChunkStart(current, currentHeading, paragraph, overlapChars);
      flush();
      current = nextStart;
    } else {
      current = candidate;
    }
  }
  flush();

  return chunks;
}
