import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { patchFetch, unpatchFetch, setToolContext, getToolContext } from "./fetch-patch.js";
import { TokenBucket } from "./token-bucket.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { defaultConfig } from "./config.js";

describe("fetch-patch", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    unpatchFetch();
    globalThis.fetch = originalFetch;
  });

  it("should call original fetch for allowed requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    const domainBuckets = { "example.com": new TokenBucket({ maxTokens: 100, refillRate: 100 }) };
    const circuitBreakers = { "example.com": new CircuitBreaker(defaultConfig.circuit) };

    patchFetch({ domainBuckets, circuitBreakers, retryConfig: defaultConfig.retry });

    await globalThis.fetch("https://example.com/data");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should block when circuit is open", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    const domainBuckets = { "example.com": new TokenBucket({ maxTokens: 100, refillRate: 100 }) };
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 10000 });
    cb.recordFailure();
    const circuitBreakers = { "example.com": cb };

    patchFetch({ domainBuckets, circuitBreakers, retryConfig: defaultConfig.retry });

    await expect(globalThis.fetch("https://example.com/data")).rejects.toThrow("Circuit breaker is OPEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should retry on 429", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    const domainBuckets = { "example.com": new TokenBucket({ maxTokens: 100, refillRate: 100 }) };
    const circuitBreakers = { "example.com": new CircuitBreaker(defaultConfig.circuit) };

    patchFetch({ domainBuckets, circuitBreakers, retryConfig: defaultConfig.retry });

    const start = Date.now();
    const response = await globalThis.fetch("https://example.com/data");
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });

  it("should track tool context via AsyncLocalStorage", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = mockFetch;

    patchFetch({ domainBuckets: {}, circuitBreakers: {}, retryConfig: defaultConfig.retry });

    const cleanup = setToolContext("marketQuery");
    expect(getToolContext()).toBe("marketQuery");
    cleanup();
    expect(getToolContext()).toBeUndefined();
  });
});
