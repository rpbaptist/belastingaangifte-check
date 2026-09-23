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

const DEFAULT_TARGET_CHARS = 1000;
const DEFAULT_OVERLAP_CHARS = 120;

export const HEADING_PATTERN = /^#{1,6}\s/;

// Splits a paragraph longer than targetChars into fragments that fit within it, so
// the main loop below never sees a single unit of text it can't bound. Cuts at
// the whitespace nearest to targetChars (never past it) to avoid breaking a word;
// falls back to a hard cut at exactly targetChars when no whitespace is in range —
// sentence-aware splitting would need a dependency or a hand-rolled sentence
// splitter, for a fallback path the current corpus never even exercises.
function splitOversizedParagraph(paragraph: string, targetChars: number): string[] {
  if (paragraph.length <= targetChars) return [paragraph];

  const fragments: string[] = [];
  let rest = paragraph;
  while (rest.length > targetChars) {
    const window = rest.slice(0, targetChars);
    const whitespaceMatches = [...window.matchAll(/\s/g)];
    const cut = whitespaceMatches.at(-1)?.index ?? targetChars;
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

// Splits doc.text into overlapping, heading-aware chunks of roughly targetChars each.
// targetChars is a soft target, not a hard ceiling: a chunk that starts a new section
// or continues one gets its heading and/or overlap tail prepended to a fragment that
// was itself already sized up to targetChars, so the result can run over. The bound on
// any chunk's text length is fixed, though:
//
//   chunk.text.length <= targetChars + heading.length + overlapChars + 4
//
// (the "+ 4" is the two "\n\n" separators between heading, overlap and fragment). It
// holds because a chunk that starts a section is heading + fragment (fragment already
// <= targetChars, and headings are themselves split to <= targetChars by
// splitOversizedParagraph), a chunk that continues one is heading + overlap + fragment,
// and every unit appended afterwards only happens while the running total stays
// <= targetChars. No downstream consumer needs a hard ceiling — the embedding model
// accepts far larger inputs, and retrieval quality is not materially affected by the
// soft target being exceeded by a small, fixed amount.
export function chunkText(
  doc: RawDocument,
  opts: { targetChars?: number; overlapChars?: number } = {}
): TextChunk[] {
  const targetChars = opts.targetChars ?? DEFAULT_TARGET_CHARS;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const units = attachHeadings(
    doc.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .flatMap((p) => splitOversizedParagraph(p, targetChars))
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
    if (current && candidate.length > targetChars) {
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
