import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("should start closed and allow requests", () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 100 });
    expect(() => cb.check()).not.toThrow();
  });

  it("should open after threshold failures", () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 100 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(() => cb.check()).toThrow("Circuit breaker is OPEN");
  });

  it("should enter half-open after cooldown", async () => {
    const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 50 });
    cb.recordFailure();
    cb.recordFailure();
    expect(() => cb.check()).toThrow();
    await new Promise((r) => setTimeout(r, 60));
    expect(() => cb.check()).not.toThrow(); // half-open
  });

  it("should close after success in half-open", async () => {
    const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 50 });
    cb.recordFailure();
    cb.recordFailure();
    await new Promise((r) => setTimeout(r, 60));
    cb.check(); // half-open
    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
    expect(() => cb.check()).not.toThrow();
  });

  it("should re-open after failure in half-open", async () => {
    const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 50 });
    cb.recordFailure();
    cb.recordFailure();
    await new Promise((r) => setTimeout(r, 60));
    cb.check(); // half-open
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    expect(() => cb.check()).toThrow();
  });

  it("should reset failure count on success when closed", () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 100 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(() => cb.check()).not.toThrow(); // only 2 failures since last success
  });
});
