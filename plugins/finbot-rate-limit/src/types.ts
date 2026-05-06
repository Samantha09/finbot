export interface BucketConfig {
  maxTokens: number;
  refillRate: number;
}

export interface CircuitConfig {
  threshold: number;
  cooldownMs: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface RateLimitConfig {
  domainBuckets: Record<string, BucketConfig>;
  toolBucket: BucketConfig;
  circuit: CircuitConfig;
  retry: RetryConfig;
}

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitOpenError extends Error {
  constructor(domain: string) {
    super(`Circuit breaker is OPEN for domain: ${domain}`);
    this.name = "CircuitOpenError";
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}
