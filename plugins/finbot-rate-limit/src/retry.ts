import type { RetryConfig } from "./types.js";

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  config: RetryConfig,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === config.maxRetries || !shouldRetry(error)) {
        throw error;
      }

      let delayMs = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);

      // Check Retry-After header
      const response = (error as { response?: { headers?: { get?: (name: string) => string | null } } }).response;
      const retryAfter = response?.headers?.get?.("retry-after");
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          delayMs = seconds * 1000;
        }
      }

      if (config.jitter) {
        delayMs += Math.random() * 500;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
