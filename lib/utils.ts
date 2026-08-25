import Anthropic from "@anthropic-ai/sdk";

function isRetryableAnthropicError(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    (err instanceof Anthropic.APIError && err.status >= 500)
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  isRetryable: (err: unknown) => boolean = isRetryableAnthropicError
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isRetryable(err) && attempt < maxAttempts) {
        const jitter = Math.random() * 500;
        await new Promise((r) => setTimeout(r, 1500 * attempt + jitter));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
