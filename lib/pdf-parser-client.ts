import { AwsClient } from "aws4fetch";
import { randomUUID } from "crypto";

export type PdfParserConfig = {
  bucket: string;
  region: string;
  functionUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
};

// The Lambda Function URL requires AWS_IAM auth and can take a while to cold
// start under SnapStart's own warm-up plus OpenDataLoader's own parsing time.
// Kept comfortably under the Lambda's own 60s Timeout (template.yaml) so a
// hung invocation still returns control to the caller's fallback path.
const INVOKE_TIMEOUT_MS = 55_000;

export function createPdfParserClient(config: PdfParserConfig) {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    // aws4fetch retries retryable responses internally by default. This
    // client's failure contract is "fail fast, let the caller fall back to
    // its own Claude-native read" (see the plan) — an internal retry loop
    // would add latency before that fallback fires without being a decision
    // anyone made, so it's disabled explicitly.
    retries: 0,
  });
  const objectUrl = (key: string) =>
    `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;

  async function parse(pdfBytes: Buffer): Promise<string> {
    const key = `${randomUUID()}.pdf`;

    const putResponse = await aws.fetch(objectUrl(key), {
      method: "PUT",
      // Buffer's ArrayBufferLike generic doesn't structurally satisfy
      // fetch's BodyInit typing here — a plain Uint8Array view does.
      body: new Uint8Array(pdfBytes),
      aws: { service: "s3" },
    });
    if (!putResponse.ok) {
      throw new Error(`PDF parser: S3 upload failed with status ${putResponse.status}`);
    }

    try {
      const invokeResponse = await aws.fetch(config.functionUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bucket: config.bucket, key }),
        aws: { service: "lambda" },
        signal: AbortSignal.timeout(INVOKE_TIMEOUT_MS),
      });
      if (!invokeResponse.ok) {
        throw new Error(`PDF parser: Lambda invocation failed with status ${invokeResponse.status}`);
      }
      const result = (await invokeResponse.json()) as { markdown: string };
      return result.markdown;
    } finally {
      // Best-effort cleanup regardless of outcome. The Lambda also deletes
      // the object on its own success path, and the bucket's lifecycle rule
      // is the final backstop — this is defense in depth, not the only
      // deletion path, so a failed delete here is never fatal.
      await aws
        .fetch(objectUrl(key), { method: "DELETE", aws: { service: "s3" } })
        .catch(() => undefined);
    }
  }

  return { parse };
}

export type PdfParserClient = ReturnType<typeof createPdfParserClient>;

/**
 * Resolves the Parser client from environment configuration, or undefined
 * if it isn't (fully) configured. Callers treat undefined the same as a
 * parse failure — see extractor.ts's resolveExtractionContent — so this
 * feature is opt-in: unset in an environment, extraction behaves exactly
 * as it did before tax-pdf-parser existed.
 */
export function getPdfParserClient(
  env: Record<string, string | undefined> = process.env
): PdfParserClient | undefined {
  const bucket = env.PDF_PARSER_BUCKET;
  const region = env.PDF_PARSER_REGION;
  const functionUrl = env.PDF_PARSER_FUNCTION_URL;
  const accessKeyId = env.PDF_PARSER_ACCESS_KEY_ID;
  const secretAccessKey = env.PDF_PARSER_SECRET_ACCESS_KEY;

  if (!bucket || !region || !functionUrl || !accessKeyId || !secretAccessKey) {
    return undefined;
  }
  return createPdfParserClient({ bucket, region, functionUrl, accessKeyId, secretAccessKey });
}
