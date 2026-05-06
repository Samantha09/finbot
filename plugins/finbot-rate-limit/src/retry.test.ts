import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff } from "./retry.js";

describe("retryWithBackoff", () => {
  it("should return on success without retry", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryWithBackoff(fn, () => true, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, jitter: false });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and succeed", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("ok");
    const result = await retryWithBackoff(fn, () => true, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, jitter: false });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw after maxRetries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(
      retryWithBackoff(fn, () => true, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100, jitter: false })
    ).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should not retry when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("404"));
    await expect(
      retryWithBackoff(fn, () => false, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, jitter: false })
    ).rejects.toThrow("404");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should respect Retry-After header", async () => {
    const error = new Error("429") as Error & { response?: { headers: { get: (name: string) => string | null } } };
    error.response = { headers: { get: (name: string) => name === "retry-after" ? "2" : null } };
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");
    const start = Date.now();
    await retryWithBackoff(fn, () => true, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, jitter: false });
    expect(Date.now() - start).toBeGreaterThanOrEqual(1900);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should use jitter when enabled", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("ok");
    const start = Date.now();
    await retryWithBackoff(fn, () => true, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100, jitter: true });
    const elapsed = Date.now() - start;
    // With jitter, delay is baseDelay * 2^0 + random(0,500) = 10 + 0~500
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });
});
