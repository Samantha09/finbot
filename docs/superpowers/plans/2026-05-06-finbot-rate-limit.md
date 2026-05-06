# finbot-rate-limit 限流熔断插件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 finbot-rate-limit 插件，为所有金融 API 调用提供两层令牌桶限流、半开熔断器和指数退避重试。

**Architecture:** 仿照 finbot-audit 的 monkey-patch registerTool 模式包装工具 execute，同时替换 globalThis.fetch 拦截所有请求。用 AsyncLocalStorage 在 wrapper 和 fetch patch 之间传递工具名。令牌桶、熔断器、重试三个模块纯函数，可独立测试。

**Tech Stack:** TypeScript 5.9 / Node.js 20 / vitest 3.2 / CommonJS / AsyncLocalStorage

---

## 文件结构

```
plugins/finbot-rate-limit/
├── openclaw.plugin.json          # 插件 manifest，含 configSchema
├── package.json                  # 依赖脚本，peer openclaw
├── tsconfig.json                 # 编译配置，照搬 finbot-guard
├── vitest.config.ts              # 测试配置，含 alias 到 mock
├── src/
│   ├── types.ts                  # RateLimitConfig, BucketConfig, RetryConfig 等类型
│   ├── config.ts                 # 默认配置 + 配置合并
│   ├── token-bucket.ts           # TokenBucket 类：acquire, refill
│   ├── circuit-breaker.ts        # CircuitBreaker 类：check, recordSuccess, recordFailure
│   ├── retry.ts                  # retryWithBackoff 函数
│   ├── fetch-patch.ts            # patchFetch / unpatchFetch，含 AsyncLocalStorage toolContext
│   ├── index.ts                  # definePluginEntry：patch fetch + monkey-patch registerTool
│   ├── __mocks__/
│   │   └── openclaw-plugin-sdk-plugin-entry.ts  # mock definePluginEntry
│   ├── token-bucket.test.ts
│   ├── circuit-breaker.test.ts
│   ├── retry.test.ts
│   └── fetch-patch.test.ts
```

---

### Task 1: 插件骨架（openclaw.plugin.json + package.json + tsconfig.json + vitest.config.ts + mock）

**Files:**
- Create: `plugins/finbot-rate-limit/openclaw.plugin.json`
- Create: `plugins/finbot-rate-limit/package.json`
- Create: `plugins/finbot-rate-limit/tsconfig.json`
- Create: `plugins/finbot-rate-limit/vitest.config.ts`
- Create: `plugins/finbot-rate-limit/src/__mocks__/openclaw-plugin-sdk-plugin-entry.ts`

- [ ] **Step 1: 创建 openclaw.plugin.json**

```json
{
  "id": "finbot-rate-limit",
  "name": "FinBot Rate Limit",
  "description": "FinBot 限流熔断插件，为金融 API 提供统一限流、退避和熔断保护",
  "enabledByDefault": true,
  "configSchema": {
    "type": "object",
    "properties": {
      "domainBuckets": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "maxTokens": { "type": "number" },
            "refillRate": { "type": "number" }
          }
        },
        "description": "域名级别令牌桶配置"
      },
      "toolBucket": {
        "type": "object",
        "properties": {
          "maxTokens": { "type": "number" },
          "refillRate": { "type": "number" }
        },
        "description": "工具级别令牌桶配置"
      },
      "circuit": {
        "type": "object",
        "properties": {
          "threshold": { "type": "number" },
          "cooldownMs": { "type": "number" }
        },
        "description": "熔断器配置"
      },
      "retry": {
        "type": "object",
        "properties": {
          "maxRetries": { "type": "number" },
          "baseDelayMs": { "type": "number" },
          "maxDelayMs": { "type": "number" },
          "jitter": { "type": "boolean" }
        },
        "description": "退避重试配置"
      }
    }
  }
}
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "finbot-rate-limit",
  "version": "1.0.0",
  "description": "FinBot 限流熔断插件",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": "./dist/index.js" },
  "files": ["dist", "openclaw.plugin.json"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:ci": "vitest run",
    "lint": "tsc --noEmit"
  },
  "peerDependencies": { "openclaw": ">=2026.4.24" },
  "devDependencies": {
    "@types/node": "^20.19.39",
    "typescript": "^5.9.3",
    "vitest": "^3.2.1"
  },
  "license": "MIT",
  "type": "commonjs",
  "openclaw": { "extensions": ["./dist/index.js"] }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": "."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "vitest.config.ts"]
}
```

- [ ] **Step 4: 创建 vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "openclaw/plugin-sdk/plugin-entry": path.resolve(
        __dirname,
        "src/__mocks__/openclaw-plugin-sdk-plugin-entry.ts",
      ),
    },
  },
});
```

- [ ] **Step 5: 创建 mock**

```typescript
// src/__mocks__/openclaw-plugin-sdk-plugin-entry.ts
export interface AnyAgentTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
}

export interface OpenClawPluginToolContext {
  // Stub — tests don't need real context
}

export function definePluginEntry(entry: {
  id: string;
  name: string;
  description: string;
  register: (api: { registerTool: (tool: AnyAgentTool) => void }) => void;
}) {
  return entry;
}
```

- [ ] **Step 6: 提交骨架**

```bash
git add plugins/finbot-rate-limit/
git commit -m "chore(rate-limit): 创建插件骨架"
```

---

### Task 2: 类型定义（types.ts）

**Files:**
- Create: `plugins/finbot-rate-limit/src/types.ts`

- [ ] **Step 1: 编写 types.ts**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add plugins/finbot-rate-limit/src/types.ts
git commit -m "feat(rate-limit): 定义配置和错误类型"
```

---

### Task 3: 默认配置（config.ts）

**Files:**
- Create: `plugins/finbot-rate-limit/src/config.ts`

- [ ] **Step 1: 编写 config.ts**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add plugins/finbot-rate-limit/src/config.ts
git commit -m "feat(rate-limit): 默认配置和合并逻辑"
```

---

### Task 4: 令牌桶限流器（token-bucket.ts + test）

**Files:**
- Create: `plugins/finbot-rate-limit/src/token-bucket.ts`
- Create: `plugins/finbot-rate-limit/src/token-bucket.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
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
    const bucket = new TokenBucket({ maxTokens: 2, refillRate: 1000 });
    await bucket.acquire();
    await new Promise((r) => setTimeout(r, 100));
    // Should have refilled but capped at maxTokens=2
    await bucket.acquire();
    const start = Date.now();
    await bucket.acquire(); // 3rd request should wait
    expect(Date.now() - start).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/token-bucket.test.ts
```
Expected: FAIL with "TokenBucket is not defined" or similar.

- [ ] **Step 3: 编写实现**

```typescript
import type { BucketConfig } from "./types.js";

export class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;

  constructor(config: BucketConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }
      const needed = tokens - this.tokens;
      const waitMs = (needed / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 100)));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    const newTokens = elapsedSec * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/token-bucket.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/finbot-rate-limit/src/token-bucket.ts plugins/finbot-rate-limit/src/token-bucket.test.ts
git commit -m "feat(rate-limit): 令牌桶限流器"
```

---

### Task 5: 熔断器（circuit-breaker.ts + test）

**Files:**
- Create: `plugins/finbot-rate-limit/src/circuit-breaker.ts`
- Create: `plugins/finbot-rate-limit/src/circuit-breaker.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/circuit-breaker.test.ts
```
Expected: FAIL

- [ ] **Step 3: 编写实现**

```typescript
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
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/circuit-breaker.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/finbot-rate-limit/src/circuit-breaker.ts plugins/finbot-rate-limit/src/circuit-breaker.test.ts
git commit -m "feat(rate-limit): 半开熔断器"
```

---

### Task 6: 退避重试（retry.ts + test）

**Files:**
- Create: `plugins/finbot-rate-limit/src/retry.ts`
- Create: `plugins/finbot-rate-limit/src/retry.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/retry.test.ts
```
Expected: FAIL

- [ ] **Step 3: 编写实现**

```typescript
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
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/retry.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/finbot-rate-limit/src/retry.ts plugins/finbot-rate-limit/src/retry.test.ts
git commit -m "feat(rate-limit): 指数退避重试"
```

---

### Task 7: Fetch Patch（fetch-patch.ts + test）

**Files:**
- Create: `plugins/finbot-rate-limit/src/fetch-patch.ts`
- Create: `plugins/finbot-rate-limit/src/fetch-patch.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/fetch-patch.test.ts
```
Expected: FAIL

- [ ] **Step 3: 编写实现**

```typescript
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
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/fetch-patch.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/finbot-rate-limit/src/fetch-patch.ts plugins/finbot-rate-limit/src/fetch-patch.test.ts
git commit -m "feat(rate-limit): fetch patch 拦截层"
```

---

### Task 8: 插件入口（index.ts + integration test）

**Files:**
- Create: `plugins/finbot-rate-limit/src/index.ts`
- Create: `plugins/finbot-rate-limit/src/index.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import plugin from "./index.js";

describe("finbot-rate-limit plugin", () => {
  let registeredTools: Array<{ name: string; execute: Function }> = [];
  let originalFetch: typeof fetch;

  beforeEach(() => {
    registeredTools = [];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    // Clean up any patched fetch
    const { unpatchFetch } = require("./fetch-patch.js");
    unpatchFetch();
    globalThis.fetch = originalFetch;
  });

  it("should register and wrap tools", () => {
    const api = {
      registerTool: vi.fn((tool: { name: string; execute: Function }) => {
        registeredTools.push(tool);
      }),
    };

    plugin.register(api);

    const mockTool = {
      name: "marketQuery",
      label: "Market Query",
      description: "Query market data",
      parameters: { type: "object", properties: {} },
      execute: vi.fn().mockResolvedValue({ content: [] }),
    };

    api.registerTool(mockTool);

    expect(registeredTools).toHaveLength(1);
    expect(registeredTools[0].name).toBe("marketQuery");
  });

  it("should pass through function tools without wrapping", () => {
    const api = {
      registerTool: vi.fn(),
    };

    plugin.register(api);

    const fnTool = vi.fn();
    api.registerTool(fnTool);

    expect(api.registerTool).toHaveBeenCalledWith(fnTool, undefined);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/index.test.ts
```
Expected: FAIL

- [ ] **Step 3: 编写实现**

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { AnyAgentTool } from "./__mocks__/openclaw-plugin-sdk-plugin-entry.js";
import { TokenBucket } from "./token-bucket.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { patchFetch, setToolContext } from "./fetch-patch.js";
import { mergeConfig } from "./config.js";
import type { RateLimitConfig } from "./types.js";

export default definePluginEntry({
  id: "finbot-rate-limit",
  name: "FinBot Rate Limit",
  description: "FinBot 限流熔断插件，为金融 API 提供统一限流、退避和熔断保护",
  register(api) {
    const config = mergeConfig((api as unknown as { config?: Partial<RateLimitConfig> }).config);

    // Build domain buckets
    const domainBuckets: Record<string, TokenBucket> = {};
    for (const [domain, bucketConfig] of Object.entries(config.domainBuckets)) {
      domainBuckets[domain] = new TokenBucket(bucketConfig);
    }

    // Build circuit breakers
    const circuitBreakers: Record<string, CircuitBreaker> = {};
    for (const domain of Object.keys(config.domainBuckets)) {
      circuitBreakers[domain] = new CircuitBreaker(config.circuit);
    }

    // Tool bucket (shared across all tools)
    const toolBucket = new TokenBucket(config.toolBucket);

    // Patch global fetch
    patchFetch({ domainBuckets, circuitBreakers, retryConfig: config.retry });

    const originalRegisterTool = api.registerTool.bind(api);

    api.registerTool = (tool: AnyAgentTool | Function, opts?) => {
      if (typeof tool === "function") {
        originalRegisterTool(tool as AnyAgentTool, opts);
        return;
      }

      const wrappedTool = {
        ...tool,
        execute: async (toolCallId: string, params: Record<string, unknown>) => {
          // Acquire tool-level token
          await toolBucket.acquire();
          // Set tool context for fetch patch
          const cleanup = setToolContext(tool.name);
          try {
            return await tool.execute(toolCallId, params);
          } finally {
            cleanup();
          }
        },
      };

      originalRegisterTool(wrappedTool, opts);
    };
  },
});
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd plugins/finbot-rate-limit && npx vitest run src/index.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add plugins/finbot-rate-limit/src/index.ts plugins/finbot-rate-limit/src/index.test.ts
git commit -m "feat(rate-limit): 插件入口，registerTool wrapper + fetch patch"
```

---

### Task 9: Docker 构建集成

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: 在 Dockerfile 中添加 finbot-rate-limit 构建**

参考 finbot-guard 的做法，在 Dockerfile 中 `COPY plugins/finbot-rate-limit` 并在构建阶段编译：

```dockerfile
# 在 finbot-guard 构建之后添加
COPY plugins/finbot-rate-limit /app/plugins/finbot-rate-limit
WORKDIR /app/plugins/finbot-rate-limit
RUN npm ci --include=dev && npm run build && npm prune --production
```

- [ ] **Step 2: 提交**

```bash
git add Dockerfile
git commit -m "build(docker): Dockerfile 新增 finbot-rate-limit 插件构建"
```

---

### Task 10: 全量测试验证

- [ ] **Step 1: 运行所有测试**

```bash
cd plugins/finbot-rate-limit && npx vitest run
```
Expected: ALL PASS

- [ ] **Step 2: TypeScript 类型检查**

```bash
cd plugins/finbot-rate-limit && npm run lint
```
Expected: No errors

- [ ] **Step 3: 提交（如有修复）**

```bash
git add -A && git commit -m "fix(rate-limit): 测试和类型检查修复"
```

---

## Self-Review

**1. Spec coverage:**
- 令牌桶限流（域名+工具两层）→ Task 4, Task 8
- 半开熔断器 → Task 5
- 指数退避重试（含 jitter + Retry-After）→ Task 6
- Fetch patch + AsyncLocalStorage 工具名追踪 → Task 7, Task 8
- 默认配置可覆盖 → Task 3
- 不丢请求（排队等待）→ Task 4 acquire 循环
- 与现有插件协作 → Task 8 wrapper 模式

**2. Placeholder scan:** 无 TBD/TODO，每步含完整代码。

**3. Type consistency:** `TokenBucket.acquire`, `CircuitBreaker.check/recordSuccess/recordFailure`, `retryWithBackoff` 签名在实现和测试中一致。

**4. Gaps:** Dockerfile 修改在 Task 9 已覆盖。
