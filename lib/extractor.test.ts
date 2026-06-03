import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "./extractor";

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
});
