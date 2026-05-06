# finbot-rate-limit 限流熔断插件设计

## 目标

为所有 FinBot 工具的外部 API 调用（东方财富、Alpha Vantage、CoinGecko 等）提供统一的限流、指数退避和熔断保护。

核心原则：**不丢请求**（排队等待而非拒绝），**自动恢复**（半开熔断）。

## 架构

```
plugins/finbot-rate-limit/
├── src/
│   ├── index.ts          # 插件入口：monkey-patch global fetch + 注册 tool wrapper
│   ├── token-bucket.ts   # 令牌桶限流器
│   ├── circuit-breaker.ts # 半开熔断器
│   ├── retry.ts          # 指数退避 + jitter
│   ├── fetch-patch.ts    # globalThis.fetch 替换层
│   ├── config.ts         # 配置加载 + 默认值
│   ├── types.ts          # 类型定义
│   └── *.test.ts         # 单元测试
├── openclaw.plugin.json
├── package.json
└── tsconfig.json
```

## 组件

### 1. 令牌桶限流器（`token-bucket.ts`）

两层限流：域名级别 + 工具级别。

```typescript
interface TokenBucket {
  tokens: number;        // 当前令牌数
  maxTokens: number;     // 桶容量
  refillRate: number;    // 每秒补充数
  lastRefill: number;    // 上次补充时间戳（ms）
}

class TokenBucketManager {
  acquire(domain: string, tokens = 1): Promise<void>
  getBucket(key: string): TokenBucket
  setConfig(key: string, config: BucketConfig): void
}
```

**域名级别默认配置**：

| 域名模式 | maxTokens | refillRate | 说明 |
|----------|-----------|------------|------|
| `*.eastmoney.com` | 10 | 10/s | 经验值，东财无官方限流 |
| `alphavantage.co` | 5 | 0.083/s | Alpha Vantage free tier: 5 calls/min |
| `coingecko.com` | 30 | 0.5/s | CoinGecko free tier: ~30/min |
| `exchangerate-api.com` | 30 | 0.5/s | 经验值 |

**工具级别默认配置**：

| 配置项 | 值 | 说明 |
|--------|------|------|
| maxTokens | 3 | 每个工具每秒最多 3 次 |
| refillRate | 1/s | 每秒补充 1 个令牌 |

桶耗尽时 `await` 等待令牌补充，不拒绝请求。

### 2. 熔断器（`circuit-breaker.ts`）

每个 API 域名一个熔断器，三态转换：

```
CLOSED  ──连续 5 次失败──>  OPEN
   ^                            │
   │                            │ 冷却 30s
   │                            ▼
   └─────1 次成功───────  HALF_OPEN
         1 次失败 ─────>  OPEN
```

```typescript
type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreaker {
  state: CircuitState;
  failures: number;       // 连续失败计数
  lastFailure: number;    // 上次失败时间戳（ms）
  threshold: number;      // 触发熔断阈值，默认 5
  cooldownMs: number;     // 冷却期，默认 30000
}

class CircuitBreakerManager {
  check(domain: string): void   // OPEN 时抛出 CircuitOpenError
  recordSuccess(domain: string): void
  recordFailure(domain: string): void
}
```

### 3. 退避重试（`retry.ts`）

```typescript
interface RetryConfig {
  maxRetries: number;     // 默认 3
  baseDelayMs: number;    // 默认 1000
  maxDelayMs: number;     // 默认 30000
  jitter: boolean;        // 默认 true
}

function retryWithBackoff<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  config: RetryConfig
): Promise<T>
```

**重试规则**：
- **重试**：429（Too Many Requests）、5xx、网络错误（fetch failed）
- **不重试**：2xx、3xx、4xx（除 429）
- **退避公式**：`delay = min(baseDelay * 2^attempt + random(0, 500), maxDelay)`
- **429 额外逻辑**：优先使用 `Retry-After` header（秒），否则走指数退避

### 4. Fetch Patch（`fetch-patch.ts`）

插件加载时替换 `globalThis.fetch`，用 `AsyncLocalStorage` 追踪当前工具名。

```typescript
const toolContext = new AsyncLocalStorage<string>();

export function setToolContext(toolName: string): () => void
export function getToolContext(): string | undefined
export function patchFetch(config: RateLimitConfig): () => void
export function unpatchFetch(): void
```

被替换的 fetch 执行流程：

1. 解析 URL → 提取域名
2. `toolContext.get()` 获取当前工具名
3. 域名桶 `acquire()` 等待令牌
4. 工具桶 `acquire()` 等待令牌
5. 熔断器 `check(domain)` — OPEN 时直接抛错
6. `retryWithBackoff(() => originalFetch(input, init))`
7. 成功 → `recordSuccess(domain)`
8. 失败 → `recordFailure(domain)`，重试用尽后抛错

### 5. Tool Wrapper（`index.ts`）

仿照 finbot-audit，monkey-patch `api.registerTool`，在 execute 外层注入 tool context：

```typescript
const originalRegisterTool = api.registerTool.bind(api);

api.registerTool = (tool: AnyAgentTool, opts?: RegisterToolOptions) => {
  if (typeof tool !== "object" || !tool.execute) {
    originalRegisterTool(tool, opts);
    return;
  }

  const wrappedTool = {
    ...tool,
    execute: async (toolCallId: string, params: Record<string, unknown>) => {
      return toolContext.run(tool.name, () => tool.execute(toolCallId, params));
    },
  };

  originalRegisterTool(wrappedTool, opts);
};
```

### 6. 配置（`config.ts`）

`openclaw.plugin.json` 的 `config` 字段，默认配置内嵌，用户可覆盖：

```json
{
  "id": "finbot-rate-limit",
  "config": {
    "domainBuckets": {
      "eastmoney.com": { "maxTokens": 10, "refillRate": 10 },
      "alphavantage.co": { "maxTokens": 5, "refillRate": 0.083 },
      "coingecko.com": { "maxTokens": 30, "refillRate": 0.5 },
      "exchangerate-api.com": { "maxTokens": 30, "refillRate": 0.5 }
    },
    "toolBucket": { "maxTokens": 3, "refillRate": 1 },
    "circuit": { "threshold": 5, "cooldownMs": 30000 },
    "retry": { "maxRetries": 3, "baseDelayMs": 1000, "maxDelayMs": 30000 }
  }
}
```

## 数据流

```
用户：查一下 AAPL 和 BTC 的价格
  │
  ▼
LLM 调用 marketQuery("AAPL") + cryptoQuery("BTC")
  │
  ▼
api.registerTool 被 monkey-patch，execute 注入 toolContext
  │
  ▼
wrapped execute → toolContext.run("marketQuery", ...)
  │
  ▼
marketQuery.execute() 内部调用 fetch(url)
  │
  ▼
被替换的 fetch intercept：
  ├─ 域名 alphavantage.co → domainBucket.acquire() 等待
  ├─ 工具 marketQuery → toolBucket.acquire() 等待
  ├─ circuit.check("alphavantage.co") → CLOSED，放行
  ├─ retryWithBackoff(() => realFetch())
  │     ├─ 成功 → circuit.recordSuccess()
  │     └─ 失败 → circuit.recordFailure() → 重试
  │
  ▼
返回结果
```

## 测试策略

| 测试类别 | 用例 | 预期 |
|----------|------|------|
| **令牌桶** | 连续 acquire 3 次，第 4 次等待 | 前 3 次立即返回，第 4 次 ~1s 后返回 |
| **令牌桶** | refill 补充后 acquire | 等待后成功 |
| **熔断器** | 连续 5 次 failure → check() | 第 6 次 check() 抛出 CircuitOpenError |
| **熔断器** | OPEN → cooldown → check() | 冷却期后进入 HALF_OPEN，check() 放行 |
| **熔断器** | HALF_OPEN → success → check() | 状态变回 CLOSED |
| **退避重试** | 429 + Retry-After: 2 | 等待 2s 后重试 |
| **退避重试** | 500 + maxRetries=2 | 重试 2 次后抛错 |
| **退避重试** | 404 | 立即抛错，不重试 |
| **Fetch Patch** | 正常 fetch → 返回结果 | 经过限流和熔断检查 |
| **Fetch Patch** | circuit OPEN → fetch | 立即抛 CircuitOpenError |
| **集成** | 模拟工具调用两次 | 域名桶和工具桶各自正确限流 |

## 边界与限制

1. **全局 fetch patch**：插件加载后所有 `fetch()` 调用都经过限流，包括非工具的 fetch。这是可接受的，因为 FinBot 的所有 fetch 都是工具发起的。
2. **域名匹配**：用 URL hostname 后缀匹配（如 `push2.eastmoney.com` 匹配 `eastmoney.com`）。
3. **工具名追踪**：依赖 `AsyncLocalStorage`，Node.js 14+ 支持。如果工具内部用 `setTimeout`/`setImmediate` 调 fetch 会丢失上下文。
4. **不持久化**：令牌桶和熔断器状态只在进程内存中，重启后重置。
5. **与现有 timeout 的协作**：工具内部的 `AbortController` timeout 仍然有效，fetch patch 的退避重试不会覆盖它们。

## 与现有插件的协作

- **finbot-audit**：audit 在 rate-limit 之前还是之后取决于插件加载顺序。OpenClaw 按依赖顺序加载，rate-limit 可以在 plugin.json 中声明依赖 audit，确保 audit 记录的是 rate-limit 包装后的 execute（即 retry 成功后的结果）。
- **finbot-guard**：guard 的 `before_tool_call` 在 execute 前触发，此时还没进 fetch patch；guard 的 middleware 在 execute 返回后触发，此时 fetch patch 已完成。
