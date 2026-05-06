import type { RateLimitConfig } from "./types.js";

export const defaultConfig: RateLimitConfig = {
  domainBuckets: {
    "eastmoney.com": { maxTokens: 10, refillRate: 10 },
    "alphavantage.co": { maxTokens: 5, refillRate: 0.083 },
    "coingecko.com": { maxTokens: 30, refillRate: 0.5 },
    "exchangerate-api.com": { maxTokens: 30, refillRate: 0.5 },
  },
  toolBucket: { maxTokens: 3, refillRate: 1 },
  circuit: { threshold: 5, cooldownMs: 30000 },
  retry: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000, jitter: true },
};

export function mergeConfig(userConfig?: Partial<RateLimitConfig>): RateLimitConfig {
  return {
    domainBuckets: { ...defaultConfig.domainBuckets, ...userConfig?.domainBuckets },
    toolBucket: { ...defaultConfig.toolBucket, ...userConfig?.toolBucket },
    circuit: { ...defaultConfig.circuit, ...userConfig?.circuit },
    retry: { ...defaultConfig.retry, ...userConfig?.retry },
  };
}
