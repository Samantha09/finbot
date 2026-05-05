# finbot-guard 安全护栏插件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `finbot-guard` 插件，为 FinBot 提供工具参数风险评分和工具返回结果敏感数据脱敏能力。

**Architecture:** 纯函数核心引擎（`guard.ts`）负责风险评分和脱敏逻辑，插件入口（`index.ts`）注册 OpenClaw 的 `before_tool_call` hook 和 `AgentToolResultMiddleware`。遵循 finbot-audit 的插件结构和 TypeScript 编码规范。

**Tech Stack:** TypeScript 5.9 / Node.js 24 / vitest / OpenClaw Plugin-SDK

---

### Task 1: 创建插件骨架文件

**Files:**
- Create: `plugins/finbot-guard/package.json`
- Create: `plugins/finbot-guard/tsconfig.json`
- Create: `plugins/finbot-guard/vitest.config.ts`
- Create: `plugins/finbot-guard/openclaw.plugin.json`
- Create: `plugins/finbot-guard/src/__mocks__/openclaw-plugin-sdk-core.ts`
- Create: `plugins/finbot-guard/src/__mocks__/openclaw-plugin-sdk-plugin-entry.ts`

- [ ] **Step 1: 创建 `package.json`**

复制 `plugins/finbot-audit/package.json`，修改 `name` 为 `"finbot-guard"`，`description` 为 `"FinBot 安全护栏插件"`，`id` 为 `"finbot-guard"`。

```json
{
  "name": "finbot-guard",
  "version": "1.0.0",
  "description": "FinBot 安全护栏插件",
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

- [ ] **Step 2: 创建 `tsconfig.json`**

复制 `plugins/finbot-audit/tsconfig.json` 内容。

- [ ] **Step 3: 创建 `vitest.config.ts`**

复制 `plugins/finbot-audit/vitest.config.ts` 内容。

- [ ] **Step 4: 创建 `openclaw.plugin.json`**

```json
{
  "id": "finbot-guard",
  "name": "FinBot Guard",
  "description": "FinBot 安全护栏插件，提供工具参数风险检测和敏感数据脱敏",
  "enabledByDefault": true,
  "configSchema": {
    "type": "object",
    "properties": {
      "detectionMode": {
        "type": "string",
        "enum": ["keyword", "off"],
        "default": "keyword",
        "description": "风险检测模式"
      },
      "customHighRiskKeywords": {
        "type": "array",
        "items": { "type": "string" },
        "description": "自定义高危关键词"
      },
      "customMediumRiskKeywords": {
        "type": "array",
        "items": { "type": "string" },
        "description": "自定义中危关键词"
      },
      "sensitiveFields": {
        "type": "array",
        "items": { "type": "string" },
        "description": "额外敏感字段名"
      }
    }
  }
}
```

- [ ] **Step 5: 复制 mock 文件**

从 `plugins/finbot-audit/src/__mocks__/` 复制 `openclaw-plugin-sdk-core.ts` 和 `openclaw-plugin-sdk-plugin-entry.ts` 到 `plugins/finbot-guard/src/__mocks__/`。

- [ ] **Step 6: Commit**

```bash
git add plugins/finbot-guard/package.json plugins/finbot-guard/tsconfig.json plugins/finbot-guard/vitest.config.ts plugins/finbot-guard/openclaw.plugin.json plugins/finbot-guard/src/__mocks__/
git commit -m "chore(guard): 创建 finbot-guard 插件骨架"
```

---

### Task 2: 定义类型（`types.ts`）

**Files:**
- Create: `plugins/finbot-guard/src/types.ts`

- [ ] **Step 1: 创建 `types.ts`**

```typescript
export interface GuardOptions {
  detectionMode?: "keyword" | "off";
  customHighRiskKeywords?: string[];
  customMediumRiskKeywords?: string[];
  sensitiveFields?: string[];
}

export type RiskLevel = "low" | "medium" | "high";

export interface RiskScore {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

export interface SanitizeRule {
  fieldNames: string[];
  pattern?: RegExp;
  mask: (value: string) => string;
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/finbot-guard/src/types.ts
git commit -m "feat(guard): 定义 GuardOptions、RiskScore、SanitizeRule 类型"
```

---

### Task 3: 风险评分引擎（`guard.ts` - 评分部分）

**Files:**
- Create: `plugins/finbot-guard/src/guard.ts`
- Create: `plugins/finbot-guard/src/guard.test.ts`

- [ ] **Step 1: 写失败测试**

在 `guard.test.ts` 中写入：

```typescript
import { describe, it, expect } from "vitest";
import { scoreToolParams } from "./guard.js";

describe("scoreToolParams", () => {
  it("正常股票代码为低风险", () => {
    const result = scoreToolParams("marketQuery", { symbol: "AAPL" });
    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
    expect(result.reasons).toEqual([]);
  });

  it("包含高危关键词为高风险", () => {
    const result = scoreToolParams("marketQuery", { symbol: "私钥" });
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.level).toBe("high");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("超长参数为中风险", () => {
    const result = scoreToolParams("marketQuery", { symbol: "x".repeat(300) });
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.level).toBe("medium");
  });
});
```

运行测试确认失败：

```bash
cd plugins/finbot-guard && npx vitest run src/guard.test.ts
```

Expected: FAIL with "scoreToolParams is not defined"

- [ ] **Step 2: 实现评分引擎**

在 `guard.ts` 中写入：

```typescript
import type { GuardOptions, RiskScore, RiskLevel } from "./types.js";

const DEFAULT_HIGH_RISK_KEYWORDS = [
  "私钥", "private key", "password", "密码", "api_key", "secret",
  "token", "密钥", "秘钥",
];

const DEFAULT_MEDIUM_RISK_KEYWORDS = [
  "转账", "transfer funds", "withdraw", "提现", "汇款",
  "忽略之前指令", "ignore previous instructions", "forget your instructions",
  "忘记你的指令", "disregard earlier",
];

const ESCAPE_PATTERNS = [
  /忽略之前.{0,10}指令/,
  /forget\s+your\s+instructions/i,
  /disregard\s+(earlier|previous|all\s+prior)/i,
  /ignore\s+(previous|earlier|all\s+prior)\s+instructions/i,
];

function normalizeParamValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function scanText(text: string, options?: GuardOptions): { score: number; reasons: string[] } {
  if (options?.detectionMode === "off") {
    return { score: 0, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  // 1. 长度异常
  if (text.length > 200) {
    score += 20;
    reasons.push("参数长度超过 200 字符");
  }

  // 2. 高危关键词
  const highRiskKeywords = [
    ...DEFAULT_HIGH_RISK_KEYWORDS,
    ...(options?.customHighRiskKeywords || []),
  ];
  for (const kw of highRiskKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      score += 40;
      reasons.push(`命中高危关键词: "${kw}"`);
      break; // 只加一次最高分
    }
  }

  // 3. 中危关键词
  const mediumRiskKeywords = [
    ...DEFAULT_MEDIUM_RISK_KEYWORDS,
    ...(options?.customMediumRiskKeywords || []),
  ];
  for (const kw of mediumRiskKeywords) {
    if (lower.includes(kw.toLowerCase())) {
      score += 20;
      reasons.push(`命中中危关键词: "${kw}"`);
      break;
    }
  }

  // 4. 提示词逃逸模式
  for (const pattern of ESCAPE_PATTERNS) {
    if (pattern.test(text)) {
      score += 30;
      reasons.push("检测到提示词逃逸模式");
      break;
    }
  }

  // 5. 字段类型异常（symbol 字段含中文句子）
  if (/[一-龥]{2,}/.test(text) && text.length > 20) {
    score += 30;
    reasons.push("参数包含异常中文长文本");
  }

  return { score, reasons };
}

export function scoreToolParams(
  toolName: string,
  params: Record<string, unknown>,
  options?: GuardOptions,
): RiskScore {
  let totalScore = 0;
  const reasons: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    const text = normalizeParamValue(value);
    const { score, reasons: rs } = scanText(text, options);
    if (score > 0) {
      totalScore += score;
      reasons.push(...rs.map((r) => `[${key}] ${r}`));
    }
  }

  totalScore = Math.min(totalScore, 100);

  let level: RiskLevel;
  if (totalScore <= 30) level = "low";
  else if (totalScore <= 60) level = "medium";
  else level = "high";

  return { score: totalScore, level, reasons };
}
```

- [ ] **Step 3: 运行测试确认通过**

```bash
cd plugins/finbot-guard && npx vitest run src/guard.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add plugins/finbot-guard/src/guard.ts plugins/finbot-guard/src/guard.test.ts
git commit -m "feat(guard): 实现工具参数风险评分引擎"
```

---

### Task 4: 脱敏引擎（`guard.ts` - 脱敏部分）

**Files:**
- Modify: `plugins/finbot-guard/src/guard.ts`
- Modify: `plugins/finbot-guard/src/guard.test.ts`

- [ ] **Step 1: 写失败测试**

在 `guard.test.ts` 中追加：

```typescript
import { sanitizeToolResult } from "./guard.js";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

describe("sanitizeToolResult", () => {
  it("保留非敏感字段", () => {
    const result: AgentToolResult = {
      content: [{ type: "text", text: "价格: 100" }],
      details: { price: 100, symbol: "AAPL" },
    };
    const sanitized = sanitizeToolResult(result);
    expect(sanitized.details).toEqual({ price: 100, symbol: "AAPL" });
  });

  it("脱敏 phone 字段", () => {
    const result: AgentToolResult = {
      content: [{ type: "text", text: "联系客服" }],
      details: { phone: "13800138000" },
    };
    const sanitized = sanitizeToolResult(result);
    expect((sanitized.details as any).phone).toBe("138****8000");
  });

  it("脱敏 text 内容中的手机号", () => {
    const result: AgentToolResult = {
      content: [{ type: "text", text: "客服电话 13800138000" }],
      details: {},
    };
    const sanitized = sanitizeToolResult(result);
    expect((sanitized.content[0] as any).text).toBe("客服电话 138****8000");
  });
});
```

运行测试确认失败。

- [ ] **Step 2: 实现脱敏引擎**

在 `guard.ts` 中追加：

```typescript
import type { AgentToolResult } from "@mariozechner/pi-agent-core";

const DEFAULT_SENSITIVE_FIELDS = [
  "apiKey", "token", "password", "secret", "auth",
  "balance", "amount", "totalAsset", "assets",
  "phone", "mobile", "tel",
  "idCard", "ssn", "idNumber",
  "email", "mail",
  "bankCard", "cardNumber", "cardNo",
];

const PHONE_REGEX = /(\+?86[-\s]?)?1[3-9]\d{9}/g;
const IDCARD_REGEX = /\d{6}(\d{4})(\d{4})\d{3}[\dXx]/g;
const EMAIL_REGEX = /([a-zA-Z0-9._-]{2})([a-zA-Z0-9._-]*)@([a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g;

function maskApiKey(value: string): string {
  if (value.length <= 6) return "***";
  return value.slice(0, 3) + "***" + value.slice(-3);
}

function maskPhone(value: string): string {
  return value.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

function maskIdCard(value: string): string {
  return value.replace(IDCARD_REGEX, (match, year, monthDay) => {
    return match.slice(0, 6) + "********" + match.slice(-4);
  });
}

function maskEmail(value: string): string {
  return value.replace(EMAIL_REGEX, (_, prefix1, prefixRest, domain) => {
    return prefix1 + "***@" + domain;
  });
}

function maskGeneric(value: string): string {
  if (value.length <= 4) return "***";
  return value.slice(0, 2) + "***" + value.slice(-2);
}

function sanitizeValue(key: string, value: unknown, extraFields?: string[]): unknown {
  if (typeof value !== "string") return value;

  const sensitiveFields = [...DEFAULT_SENSITIVE_FIELDS, ...(extraFields || [])];
  const lowerKey = key.toLowerCase();

  if (sensitiveFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
    if (lowerKey.includes("phone") || lowerKey.includes("mobile") || lowerKey.includes("tel")) {
      return maskPhone(value);
    }
    if (lowerKey.includes("idcard") || lowerKey.includes("ssn")) {
      return maskIdCard(value);
    }
    if (lowerKey.includes("email") || lowerKey.includes("mail")) {
      return maskEmail(value);
    }
    if (lowerKey.includes("apikey") || lowerKey.includes("token") || lowerKey.includes("secret")) {
      return maskApiKey(value);
    }
    return maskGeneric(value);
  }

  return value;
}

function sanitizeText(text: string): string {
  return text
    .replace(PHONE_REGEX, (match) => maskPhone(match))
    .replace(IDCARD_REGEX, (match) => maskIdCard(match))
    .replace(EMAIL_REGEX, (match) => maskEmail(match));
}

function deepSanitize(obj: unknown, extraFields?: string[]): unknown {
  if (typeof obj === "string") {
    return sanitizeText(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepSanitize(item, extraFields));
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedValue = sanitizeValue(key, value, extraFields);
      if (typeof sanitizedValue === "string") {
        result[key] = sanitizeText(sanitizedValue);
      } else {
        result[key] = deepSanitize(sanitizedValue, extraFields);
      }
    }
    return result;
  }
  return obj;
}

export function sanitizeToolResult(
  result: AgentToolResult,
  options?: GuardOptions,
): AgentToolResult {
  return {
    ...result,
    content: result.content.map((c) => {
      if (c.type === "text") {
        return { ...c, text: sanitizeText(c.text) };
      }
      return c;
    }),
    details: deepSanitize(result.details, options?.sensitiveFields),
  };
}
```

- [ ] **Step 3: 运行测试确认通过**

```bash
cd plugins/finbot-guard && npx vitest run src/guard.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add plugins/finbot-guard/src/guard.ts plugins/finbot-guard/src/guard.test.ts
git commit -m "feat(guard): 实现敏感数据脱敏引擎"
```

---

### Task 5: 插件入口（`index.ts`）

**Files:**
- Create: `plugins/finbot-guard/src/index.ts`

- [ ] **Step 1: 创建 `index.ts`**

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginHookBeforeToolCallResult } from "openclaw/plugin-sdk/plugin-entry";
import { scoreToolParams, sanitizeToolResult } from "./guard.js";
import type { GuardOptions } from "./types.js";

export { scoreToolParams, sanitizeToolResult };
export type { GuardOptions, RiskScore, RiskLevel } from "./types.js";

export default definePluginEntry({
  id: "finbot-guard",
  name: "FinBot Guard",
  description: "FinBot 安全护栏插件，提供工具参数风险检测和敏感数据脱敏",
  register(api) {
    const pluginConfig = (api.pluginConfig || {}) as GuardOptions;

    // 1. before_tool_call hook：风险评分
    api.on("before_tool_call", async (event) => {
      const score = scoreToolParams(event.toolName, event.params, pluginConfig);

      if (score.level !== "low") {
        // 使用 setRunContext 暂存风险评分，供后续使用
        api.setRunContext({
          runId: event.runId || "default",
          namespace: "finbot-guard",
          patch: {
            [`${event.toolCallId || event.toolName}`]: {
              score: score.score,
              level: score.level,
              reasons: score.reasons,
            },
          },
        });
      }

      // 不拦截，只记录评分
      return undefined;
    });

    // 2. AgentToolResultMiddleware：脱敏
    api.registerAgentToolResultMiddleware(async (event) => {
      const sanitized = sanitizeToolResult(event.result, pluginConfig);
      return { result: sanitized };
    });
  },
});
```

- [ ] **Step 2: 运行 lint 确认编译通过**

```bash
cd plugins/finbot-guard && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add plugins/finbot-guard/src/index.ts
git commit -m "feat(guard): 注册 before_tool_call hook 和 AgentToolResultMiddleware"
```

---

### Task 6: 修改 Dockerfile

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: 添加 finbot-guard 构建步骤**

在 Dockerfile 中 `finbot-audit` 构建步骤之后、`skills/` 复制之前插入：

```dockerfile
COPY plugins/finbot-guard/package.json plugins/finbot-guard/tsconfig.json plugins/finbot-guard/openclaw.plugin.json plugins/finbot-guard/
COPY plugins/finbot-guard/src/ plugins/finbot-guard/src/

RUN cd plugins/finbot-guard && npm install && npm run build && npm run test:ci
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "build(docker): Dockerfile 新增 finbot-guard 插件构建"
```

---

### Task 7: 修改 `openclaw.json`

**Files:**
- Modify: `openclaw.json`

- [ ] **Step 1: 添加 `finbot-guard` 条目**

在 `plugins.entries` 中追加：

```json
"finbot-guard": { "enabled": true }
```

- [ ] **Step 2: Commit**

```bash
git add openclaw.json
git commit -m "config(openclaw): 启用 finbot-guard 插件"
```

---

### Task 8: 构建与部署

**Files:**
- 无新文件

- [ ] **Step 1: 构建 Docker 镜像**

```bash
docker compose build
```

Expected: 成功构建，包含 finbot-guard 的测试通过

- [ ] **Step 2: 重启容器**

```bash
docker compose down && docker compose up -d
```

- [ ] **Step 3: 验证插件加载**

```bash
docker compose exec finbot openclaw plugins list | grep finbot-guard
```

Expected: 显示 `finbot-guard` 为 `enabled`

- [ ] **Step 4: Commit（如有配置更新）**

---

## 自检清单

1. **Spec 覆盖检查**：
   - ✅ `before_tool_call` hook 风险评分 → Task 5
   - ✅ `AgentToolResultMiddleware` 脱敏 → Task 4 + Task 5
   - ✅ 告警而非阻断 → Task 3（scoreToolParams 不返回 block）
   - ✅ 配置 Schema → Task 1（openclaw.plugin.json）
   - ✅ 测试覆盖 → Task 3 + Task 4

2. **Placeholder 扫描**：无 TBD/TODO/"implement later"

3. **类型一致性**：
   - `RiskScore`、`RiskLevel`、`GuardOptions` 在 `types.ts` 定义
   - `scoreToolParams` 和 `sanitizeToolResult` 签名在 `guard.ts` 和 `index.ts` 一致
