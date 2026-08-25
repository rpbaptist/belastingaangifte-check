// Offline, dev-time only. Scrapes the curated SOURCE_PAGES list, chunks each page, embeds
// the chunks via Voyage AI, and writes lib/rag/corpus.json. Run by hand via
// `npm run scrape:kennisbank` whenever the curated page list changes or Belastingdienst
// content is materially updated — never run in CI or on build (see docs/adr/0007).
import { load } from "cheerio";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { chunkText } from "../../lib/rag/chunker";
import { createVoyageClient } from "../../lib/rag/embeddings";
import { isDisallowed, SOURCE_PAGES, type SourcePage } from "./source-pages";
import type { Chunk } from "../../lib/rag/types";

const USER_AGENT = "belastingaangifte-check-kennisbank-scraper/1.0";
const FETCH_DELAY_MS = 450;
const CACHE_DIR = path.join(process.cwd(), ".rag-scrape-cache");
// Kept well under Voyage's reduced new-account tier (10K TPM) as well as its standard
// tier — a ~1000-char chunk is roughly 200-250 tokens, so 30 chunks stays under ~7.5K.
const EMBED_BATCH_SIZE = 30;
const EMBED_BATCH_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cachePathFor(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return path.join(CACHE_DIR, `${hash}.html`);
}

async function fetchHtml(url: string): Promise<string> {
  const cachePath = cachePathFor(url);
  if (existsSync(cachePath)) return readFileSync(cachePath, "utf-8");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, html, "utf-8");
  return html;
}

// Converts the page's main content to the chunker's expected markdown-ish plain text:
// headings become `#`-prefixed lines, paragraphs become blank-line-separated blocks.
// The content selector is a best guess — verify against the live DOM and adjust if pages
// come back empty or full of nav/footer noise.
function extractText(html: string): string {
  const $ = load(html);
  $("nav, footer, script, style, aside, header").remove();

  const main = $("main").length ? $("main") : $("article, .content, #content").first();
  const root = main.length ? main : $("body");

  const lines: string[] = [];
  root.find("h1, h2, h3, p, li").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (!text) return;
    if (tag === "h1") lines.push(`# ${text}`);
    else if (tag === "h2") lines.push(`## ${text}`);
    else if (tag === "h3") lines.push(`### ${text}`);
    else lines.push(text);
  });

  return lines.join("\n\n");
}

async function scrapePage(page: SourcePage) {
  if (isDisallowed(page.url)) {
    throw new Error(`URL is disallowed by robots.txt guard: ${page.url}`);
  }

  const html = await fetchHtml(page.url);
  const text = extractText(html);
  return chunkText({ url: page.url, title: page.title, text });
}

async function main() {
  const client = createVoyageClient();
  const allTextChunks: { sourceUrl: string; sourceTitle: string; text: string }[] = [];

  for (const page of SOURCE_PAGES) {
    process.stdout.write(`Scraping ${page.url}... `);
    try {
      const chunks = await scrapePage(page);
      allTextChunks.push(...chunks);
      console.log(`${chunks.length} chunks`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(FETCH_DELAY_MS);
  }

  console.log(`\nEmbedding ${allTextChunks.length} chunks via Voyage AI...`);
  const chunks: Chunk[] = [];
  for (let i = 0; i < allTextChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allTextChunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await client.embed(
      batch.map((c) => c.text),
      "document"
    );
    batch.forEach((c, j) => {
      chunks.push({ ...c, id: `${c.sourceUrl}#${i + j}`, embedding: embeddings[j] });
    });
    console.log(
      `  embedded ${Math.min(i + EMBED_BATCH_SIZE, allTextChunks.length)}/${allTextChunks.length}`
    );
    await sleep(EMBED_BATCH_DELAY_MS);
  }

  const outPath = path.join(process.cwd(), "lib", "rag", "corpus.json");
  writeFileSync(outPath, JSON.stringify(chunks, null, 2), "utf-8");

  const totalChars = allTextChunks.reduce((sum, c) => sum + c.text.length, 0);
  console.log(
    `\nWrote ${chunks.length} chunks (${totalChars.toLocaleString()} chars) to ${outPath}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
