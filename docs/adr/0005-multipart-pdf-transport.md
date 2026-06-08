# ADR 0005: multipart/form-data for PDF transport

## Status

Accepted

## Context

PDF files were serialised as base64 strings inside a JSON body on both the initial (`/api/analyze`) and incremental (`/api/analyze/incremental`) routes. Base64 encoding inflates binary size by ~33%, and a typical aangifte + 4 jaaropgaves produced a 5–10 MB JSON body. This caused production failures on Vercel, where the default body size limit for API routes is lower than the Server Actions limit configured in `next.config.js`.

An alternative (server-side session) was considered to avoid re-sending data on incremental uploads, but rejected: `extractedData` is already structured JSON (small), not PDF bytes. The actual data being re-sent per request is only the new PDF files. Vercel serverless functions are also stateless, making a server-side session impossible without an external store — which adds infrastructure complexity inappropriate for a demo.

## Decision

Both routes accept `multipart/form-data`. PDFs are sent as native `File` parts; metadata is sent as text fields.

- **Initial route**: `taxReturn` (single File), `annualStatements` (multiple Files, same key)
- **Incremental route**: same file fields, plus `extractedData` as a JSON-encoded text field

The `File → base64` conversion for the Anthropic API happens at the route boundary (`Buffer.from(await file.arrayBuffer()).toString("base64")`). The extractor interface (`pdfBase64: string`) is unchanged.

The `AnalyseRequest` and `IncrementalRequest` types, which described the old JSON wire format, are deleted. The `fileToBase64` client-side utility is deleted.

## Alternatives considered

- **Increase body size limit** — no standard configuration point for API route body size in Next.js 16; `serverActions.bodySizeLimit` applies only to Server Actions
- **Server-side session store** — requires external infrastructure (Redis, Vercel KV); disproportionate for a BYOK demo
- **Stream PDFs** — Next.js 16 route handlers support streaming but the Anthropic SDK document blocks require the full base64 at call time; no benefit over multipart

## Consequences

- Body size drops by ~25% (no base64 inflation) and parsing moves from JSON to native multipart
- `Content-Type: application/json` must not be set on fetch calls from the client — the browser sets the multipart boundary automatically
- The dev extraction cache is unaffected: it is keyed by SHA-256 of the base64 string, which is now computed server-side from the same bytes
- Future callers of the API (e.g. a CLI) must send multipart rather than JSON
