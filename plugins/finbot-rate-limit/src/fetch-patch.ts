import { AsyncLocalStorage } from "async_hooks";
import { TokenBucket } from "./token-bucket.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { retryWithBackoff } from "./retry.js";
import { CircuitOpenError, type RetryConfig } from "./types.js";

const toolContext = new AsyncLocalStorage<string>();

export function setToolContext(toolName: string): () => void {
  toolContext.enterWith(toolName);
  return () => toolContext.disable();
}

export function getToolContext(): string | undefined {
  return toolContext.getStore();
}

interface PatchOptions {
  domainBuckets: Record<string, TokenBucket>;
  circuitBreakers: Record<string, CircuitBreaker>;
  retryConfig: RetryConfig;
}

let isPatched = false;
let originalFetch: typeof fetch;

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname;
  } catch {
    return "unknown";
  }
}

function matchDomain(hostname: string, patterns: Record<string, unknown>): string | undefined {
  // Check exact match first
  if (patterns[hostname]) return hostname;
  // Check suffix match (e.g. push2.eastmoney.com matches eastmoney.com)
  const parts = hostname.split(".");
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join(".");
    if (patterns[suffix]) return suffix;
  }
  return undefined;
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false;
  // Retry on network errors (no response property) and 429/5xx
  const err = error as { response?: { status?: number } };
  if (!err.response) return true; // network error
  const status = err.response.status;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  return false;
}

export function patchFetch(options: PatchOptions): void {
  if (isPatched) return;
  originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const hostname = extractDomain(url);
    const domain = matchDomain(hostname, options.domainBuckets) || hostname;

    // Domain rate limit
    const domainBucket = options.domainBuckets[domain];
    if (domainBucket) {
      await domainBucket.acquire();
    }

    // Tool rate limit
    const toolName = getToolContext();
    // Tool bucket will be managed externally (in index.ts wrapper)

    // Circuit breaker
    const circuit = options.circuitBreakers[domain];
    if (circuit) {
      circuit.check();
    }

    return retryWithBackoff(
      async () => {
        const response = await originalFetch(input, init);
        if (response.ok || response.status === 429) {
          if (circuit) circuit.recordSuccess();
        } else if (response.status >= 500) {
          if (circuit) circuit.recordFailure();
        }
        if (!response.ok && (response.status >= 500 || response.status === 429)) {
          const error = new Error(`HTTP ${response.status}`) as Error & { response: Response };
          error.response = response;
          throw error;
        }
        return response;
      },
      shouldRetry,
      options.retryConfig,
    );
  };

  isPatched = true;
}

export function unpatchFetch(): void {
  if (!isPatched) return;
  globalThis.fetch = originalFetch;
  isPatched = false;
}
