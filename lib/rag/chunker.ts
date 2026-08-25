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

export function chunkText(
  doc: RawDocument,
  opts: { maxChars?: number; overlapChars?: number } = {}
): TextChunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const paragraphs = doc.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

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
      const overlap = current.slice(-overlapChars);
      flush();
      const prefixParts = [];
      if (currentHeading && currentHeading !== paragraph) prefixParts.push(currentHeading);
      if (overlap && overlap !== currentHeading) prefixParts.push(overlap);
      prefixParts.push(paragraph);
      current = prefixParts.join("\n\n");
    } else {
      current = candidate;
    }
  }
  flush();

  return chunks;
}
