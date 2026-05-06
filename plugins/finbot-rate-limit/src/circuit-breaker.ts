import { CircuitOpenError, type CircuitConfig, type CircuitState } from "./types.js";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private lastFailure = 0;
  private threshold: number;
  private cooldownMs: number;

  constructor(config: CircuitConfig) {
    this.threshold = config.threshold;
    this.cooldownMs = config.cooldownMs;
  }

  check(): void {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure >= this.cooldownMs) {
        this.state = "half-open";
        return;
      }
      throw new CircuitOpenError("domain");
    }
    // closed or half-open: allow
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.state === "half-open" || this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
