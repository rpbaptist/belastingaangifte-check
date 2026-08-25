import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createVoyageClient } from "./embeddings";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createVoyageClient", () => {
  it("throws when no API key is available", () => {
    expect(() => createVoyageClient(undefined)).toThrow("VOYAGE_API_KEY is not set");
  });

  it("retries on 429 and succeeds once the rate limit clears", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { detail: "rate limited" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ embedding: [1, 2, 3] }] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createVoyageClient("test-key");
    const promise = client.embed(["hello"], "document");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await promise).toEqual([[1, 2, 3]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated 429s and throws", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(429, { detail: "rate limited" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createVoyageClient("test-key");
    const assertion = expect(client.embed(["hello"], "document")).rejects.toThrow(
      "Voyage embeddings request failed: 429"
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry on a non-retryable error status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: "bad key" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createVoyageClient("test-key");
    await expect(client.embed(["hello"], "document")).rejects.toThrow(
      "Voyage embeddings request failed: 401"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
