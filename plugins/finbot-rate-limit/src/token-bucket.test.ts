import { describe, it, expect } from "vitest";
import { TokenBucket } from "./token-bucket.js";

describe("TokenBucket", () => {
  it("should allow requests when tokens are available", async () => {
    const bucket = new TokenBucket({ maxTokens: 3, refillRate: 1 });
    const start = Date.now();
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("should wait when tokens are exhausted", async () => {
    const bucket = new TokenBucket({ maxTokens: 1, refillRate: 10 });
    await bucket.acquire();
    const start = Date.now();
    await bucket.acquire(); // should wait ~100ms for 1 token
    expect(Date.now() - start).toBeGreaterThanOrEqual(80);
  });

  it("should refill tokens over time", async () => {
    const bucket = new TokenBucket({ maxTokens: 1, refillRate: 100 });
    await bucket.acquire();
    await new Promise((r) => setTimeout(r, 15));
    const start = Date.now();
    await bucket.acquire(); // 100 tokens/sec = 1.5 tokens in 15ms
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("should not exceed maxTokens after refill", async () => {
    const bucket = new TokenBucket({ maxTokens: 2, refillRate: 10 });
    await bucket.acquire();
    await new Promise((r) => setTimeout(r, 300));
    // Should have refilled but capped at maxTokens=2
    const start = Date.now();
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire(); // 3rd request should wait
    expect(Date.now() - start).toBeGreaterThanOrEqual(80);
  });
});
