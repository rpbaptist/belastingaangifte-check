import { describe, expect, it, vi, afterEach } from "vitest";
import { createPdfParserClient, getPdfParserClient } from "./pdf-parser-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const config = {
  bucket: "test-bucket",
  region: "eu-central-1",
  functionUrl: "https://example.lambda-url.eu-central-1.on.aws/",
  accessKeyId: "AKIATEST",
  secretAccessKey: "secret",
};

describe("createPdfParserClient", () => {
  it("uploads the PDF, invokes the Lambda, and returns the markdown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // S3 PUT
      .mockResolvedValueOnce(jsonResponse(200, { markdown: "# Jaaropgave" })) // Lambda invoke
      .mockResolvedValueOnce(new Response(null, { status: 204 })); // S3 DELETE cleanup
    vi.stubGlobal("fetch", fetchMock);

    const client = createPdfParserClient(config);
    const markdown = await client.parse(Buffer.from("%PDF-1.4 fake"));

    expect(markdown).toBe("# Jaaropgave");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws when the Lambda invocation fails, but still cleans up the upload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // S3 PUT
      .mockResolvedValueOnce(new Response("boom", { status: 500 })) // Lambda invoke fails
      .mockResolvedValueOnce(new Response(null, { status: 204 })); // S3 DELETE cleanup
    vi.stubGlobal("fetch", fetchMock);

    const client = createPdfParserClient(config);

    await expect(client.parse(Buffer.from("%PDF-1.4 fake"))).rejects.toThrow(
      "Lambda invocation failed with status 500"
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const cleanupCall = fetchMock.mock.calls[2][0] as Request;
    expect(cleanupCall.method).toBe("DELETE");
  });

  it("throws when the S3 upload fails, without invoking the Lambda", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("denied", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createPdfParserClient(config);

    await expect(client.parse(Buffer.from("%PDF-1.4 fake"))).rejects.toThrow(
      "S3 upload failed with status 403"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getPdfParserClient", () => {
  const fullEnv = {
    PDF_PARSER_BUCKET: "b",
    PDF_PARSER_REGION: "eu-central-1",
    PDF_PARSER_FUNCTION_URL: "https://example.lambda-url.eu-central-1.on.aws/",
    PDF_PARSER_ACCESS_KEY_ID: "AKIATEST",
    PDF_PARSER_SECRET_ACCESS_KEY: "secret",
  };

  it("returns a client when every required env var is set", () => {
    expect(getPdfParserClient(fullEnv)).toBeDefined();
  });

  it("returns undefined when any required env var is missing", () => {
    const { PDF_PARSER_SECRET_ACCESS_KEY: _omit, ...partialEnv } = fullEnv;
    expect(getPdfParserClient(partialEnv)).toBeUndefined();
  });

  it("returns undefined for a completely empty env", () => {
    expect(getPdfParserClient({})).toBeUndefined();
  });
});
