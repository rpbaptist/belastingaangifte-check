import Anthropic from "@anthropic-ai/sdk";

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Anthropic.APIError && err.status >= 500);
      if (retryable && attempt < maxAttempts) {
        const jitter = Math.random() * 500;
        await new Promise((r) => setTimeout(r, 1500 * attempt + jitter));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
