import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "./utils";
import { extractAnnualStatement, extractTaxReturn } from "./extractor";

function makeResponse(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [],
    ...overrides,
  } as Anthropic.Message;
}

function makeClient(response: Anthropic.Message): Anthropic {
  return { messages: { create: vi.fn().mockResolvedValue(response) } } as unknown as Anthropic;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function settle<T>(
  promise: Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on RateLimitError and succeeds", async () => {
    const rateLimit = new Anthropic.RateLimitError(429, undefined, "", new Headers());
    const fn = vi.fn().mockRejectedValueOnce(rateLimit).mockResolvedValue("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx APIError and succeeds", async () => {
    const serverError = new Anthropic.APIError(503, undefined, "", new Headers());
    const fn = vi.fn().mockRejectedValueOnce(serverError).mockResolvedValue("ok");

    const promise = withRetry(fn);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx client errors", async () => {
    const authError = new Anthropic.AuthenticationError(401, undefined, "", new Headers());
    const fn = vi.fn().mockRejectedValue(authError);

    const result = await settle(withRetry(fn));
    expect(result.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts maxAttempts and throws", async () => {
    const rateLimit = new Anthropic.RateLimitError(429, undefined, "", new Headers());
    const fn = vi.fn().mockRejectedValue(rateLimit);

    const assertion = expect(withRetry(fn, 3)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-Anthropic errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network failure"));

    const result = await settle(withRetry(fn));
    expect(result.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses a custom isRetryable predicate when provided", async () => {
    class CustomError extends Error {
      constructor(public status: number) {
        super("custom");
      }
    }
    const fn = vi.fn().mockRejectedValueOnce(new CustomError(429)).mockResolvedValue("ok");

    const promise = withRetry(fn, 4, (err) => err instanceof CustomError && err.status === 429);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the custom isRetryable predicate returns false", async () => {
    class CustomError extends Error {
      constructor(public status: number) {
        super("custom");
      }
    }
    const fn = vi.fn().mockRejectedValue(new CustomError(401));

    const result = await settle(
      withRetry(fn, 4, (err) => err instanceof CustomError && err.status === 429)
    );
    expect(result.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("extractAnnualStatement / extractTaxReturn", () => {
  it("throws a Dutch error when the annual statement response has no text block", async () => {
    const client = makeClient(makeResponse());
    await expect(extractAnnualStatement("pdf-base64", client)).rejects.toThrow(
      "Geen reactie ontvangen bij verwerking van de jaaropgave"
    );
  });

  it("throws an English error when the tax return response has no text block", async () => {
    const client = makeClient(makeResponse());
    await expect(extractTaxReturn("pdf-base64", client, "en")).rejects.toThrow(
      "No response received while processing the tax return"
    );
  });
});
