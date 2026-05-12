# FinBot 仓位管理功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `updatePosition` 和 `getPositionReport` 两个工具，实现持仓数据存储和调仓报告生成。

**Architecture:** 数据存储在 `~/.openclaw/finbot-positions/` 下的 JSON/JSONL 文件，工具通过 `fs/promises` 读写。报告通过对比相邻两日持仓自动生成。

**Tech Stack:** TypeScript 5.9+ / Node.js 20+ / vitest 3.2+ / CommonJS / `strict: true`

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `plugins/finbot-market/src/tools/position-management.ts` | 新建 | `updatePosition` + `getPositionReport` 实现 |
| `plugins/finbot-market/src/tools/position-management.test.ts` | 新建 | 单元测试 |
| `plugins/finbot-market/src/index.ts` | 修改 | 注册两个新工具 |
| `plugins/finbot-market/openclaw.plugin.json` | 修改 | 在 contracts.tools 中注册 |
| `skills/position-management/SKILL.md` | 新建 | OpenClaw skill |

---

## 前提知识

### 工具返回结构
`toToolResult({ content, isError })` 内部调用 `jsonResult({ text, isError })`，最终返回：
```ts
{ content: [{ type: "text", text: JSON.stringify({ text: "内容", isError: false }) }] }
```

测试中验证方式：
```ts
const text = (result as any).content[0].text;
const parsed = JSON.parse(text);
expect(parsed.isError).toBe(false);
expect(parsed.text).toContain("某文本");
```

### Mock fs 模式
```ts
vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify([]))),
  writeFile: vi.fn(() => Promise.resolve(undefined)),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
  readdir: vi.fn(() => Promise.resolve([])),
}));
```

### 数据目录
```ts
const DATA_DIR = path.join(process.env.HOME || "", ".openclaw", "finbot-positions");
```

---

## Task 1: updatePosition 工具

**Files:**
- Create: `plugins/finbot-market/src/tools/position-management.ts`
- Create: `plugins/finbot-market/src/tools/position-management.test.ts`

---

- [ ] **Step 1: Write the failing test for updatePosition**

`plugins/finbot-market/src/tools/position-management.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUpdatePositionTool, createGetPositionReportTool } from "./position-management.js";

let fileMap: Map<string, string> = new Map();

vi.mock("fs/promises", () => ({
  readFile: vi.fn((filePath: string) => {
    const data = fileMap.get(filePath);
    if (data === undefined) {
      const err = new Error("ENOENT") as any;
      err.code = "ENOENT";
      return Promise.reject(err);
    }
    return Promise.resolve(data);
  }),
  writeFile: vi.fn((filePath: string, data: string) => {
    fileMap.set(filePath, data);
    return Promise.resolve(undefined);
  }),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
  readdir: vi.fn(() => Promise.resolve([])),
}));

const sampleHolding = {
  symbol: "510310",
  name: "沪深300ETF易方达",
  quantity: 600,
  availableQuantity: 600,
  costPrice: 4.836,
  currentPrice: 4.804,
  marketValue: 2882.40,
  profit: -19.00,
  profitPercent: -0.0066,
};

const sampleTrade = {
  time: "09:33:05",
  symbol: "510310",
  name: "沪深300ETF易方达",
  direction: "buy" as const,
  price: 4.819,
  quantity: 400,
  amount: 1927.60,
};

const sampleSummary = {
  totalAsset: 124607.15,
  dailyProfit: -268.80,
  availableCash: 5723.35,
  holdingMarketValue: 118883.80,
  holdingProfit: -3953.48,
  positionRatio: 0.9541,
};

describe("updatePosition tool", () => {
  let tool: ReturnType<typeof createUpdatePositionTool>;

  beforeEach(() => {
    tool = createUpdatePositionTool();
    fileMap = new Map();
    vi.clearAllMocks();
  });

  it("tool metadata correct", () => {
    expect(tool.name).toBe("updatePosition");
    expect(tool.parameters).toBeDefined();
  });

  it("stores position data correctly", async () => {
    const result = await tool.execute("tc1", {
      date: "2026-05-12",
      holdings: [sampleHolding],
      trades: [sampleTrade],
      summary: sampleSummary,
    });

    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("2026-05-12");
    expect(parsed.text).toContain("510310");
  });

  it("overwrites existing data for same date", async () => {
    await tool.execute("tc1", {
      date: "2026-05-12",
      holdings: [sampleHolding],
      trades: [],
      summary: sampleSummary,
    });

    const result = await tool.execute("tc2", {
      date: "2026-05-12",
      holdings: [{ ...sampleHolding, quantity: 1000 }],
      trades: [],
      summary: sampleSummary,
    });

    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("已更新");
  });

  it("returns error on missing required fields", async () => {
    const result = await tool.execute("tc3", { date: "2026-05-12" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
  });
});
```

Run: `cd plugins/finbot-market && npx vitest run src/tools/position-management.test.ts`
Expected: FAIL — module not found or function not exported

---

- [ ] **Step 2: Implement updatePosition tool**

`plugins/finbot-market/src/tools/position-management.ts`:

```ts
import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";

const DATA_DIR = path.join(
  process.env.HOME || "",
  ".openclaw",
  "finbot-positions",
);

const UpdatePositionSchema = {
  type: "object" as const,
  properties: {
    date: {
      type: "string" as const,
      description: "日期，如 2026-05-12",
    },
    holdings: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          symbol: { type: "string" as const },
          name: { type: "string" as const },
          quantity: { type: "number" as const },
          availableQuantity: { type: "number" as const },
          costPrice: { type: "number" as const },
          currentPrice: { type: "number" as const },
          marketValue: { type: "number" as const },
          profit: { type: "number" as const },
          profitPercent: { type: "number" as const },
        },
        required: ["symbol", "name", "quantity", "marketValue"],
      },
    },
    trades: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          time: { type: "string" as const },
          symbol: { type: "string" as const },
          name: { type: "string" as const },
          direction: { type: "string" as const, enum: ["buy", "sell"] },
          price: { type: "number" as const },
          quantity: { type: "number" as const },
          amount: { type: "number" as const },
        },
        required: ["symbol", "direction", "price", "quantity"],
      },
    },
    summary: {
      type: "object" as const,
      properties: {
        totalAsset: { type: "number" as const },
        dailyProfit: { type: "number" as const },
        availableCash: { type: "number" as const },
        holdingMarketValue: { type: "number" as const },
        holdingProfit: { type: "number" as const },
        positionRatio: { type: "number" as const },
      },
      required: ["totalAsset", "positionRatio"],
    },
  },
  required: ["date", "holdings", "summary"],
};

export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  availableQuantity?: number;
  costPrice?: number;
  currentPrice?: number;
  marketValue: number;
  profit?: number;
  profitPercent?: number;
}

export interface Trade {
  time?: string;
  symbol: string;
  name?: string;
  direction: "buy" | "sell";
  price: number;
  quantity: number;
  amount?: number;
}

export interface AccountSummary {
  totalAsset: number;
  dailyProfit?: number;
  availableCash?: number;
  holdingMarketValue?: number;
  holdingProfit?: number;
  positionRatio: number;
}

export interface DailyRecord {
  date: string;
  summary: AccountSummary;
  holdings: Holding[];
  trades: Trade[];
}

function getDateFilePath(date: string): string {
  return path.join(DATA_DIR, `${date}.json`);
}

function getJsonlPath(): string {
  return path.join(DATA_DIR, "positions.jsonl");
}

function getLatestPath(): string {
  return path.join(DATA_DIR, "latest.json");
}

export function createUpdatePositionTool(): AnyAgentTool {
  return {
    name: "updatePosition",
    label: "更新持仓",
    description: "存储某日的持仓快照、成交明细和账户汇总。同日期会覆盖旧数据。",
    parameters: UpdatePositionSchema,
    execute: async (_toolCallId, params) => {
      try {
        const { date, holdings, trades, summary } = params as {
          date: string;
          holdings: Holding[];
          trades?: Trade[];
          summary: AccountSummary;
        };

        if (!date || !Array.isArray(holdings) || holdings.length === 0 || !summary) {
          return toToolResult({ content: "参数错误：date、holdings、summary 为必填项", isError: true });
        }

        const record: DailyRecord = {
          date,
          summary,
          holdings,
          trades: trades || [],
        };

        await fs.mkdir(DATA_DIR, { recursive: true });

        const dateFile = getDateFilePath(date);
        const existed = await fileExists(dateFile);

        await fs.writeFile(dateFile, JSON.stringify(record, null, 2));
        await fs.writeFile(getLatestPath(), JSON.stringify(record, null, 2));

        // Append to JSONL
        const jsonlPath = getJsonlPath();
        const line = JSON.stringify(record) + "\n";
        await fs.appendFile(jsonlPath, line, "utf-8");

        const lines = [
          `✅ 持仓数据已${existed ? "更新" : "存储"}（${date}）`,
          "",
          `**持仓标的**: ${holdings.length} 只`,
          `**成交记录**: ${record.trades.length} 笔`,
          `**总资产**: ${summary.totalAsset.toFixed(2)}`,
          `**仓位**: ${(summary.positionRatio * 100).toFixed(2)}%`,
        ];

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `存储持仓数据失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
```

注意：需要在文件顶部添加 `appendFile` 到 fs mock 中，因为测试中 mock 了 `fs/promises` 但没有 `appendFile`。

更新 `position-management.test.ts` 的 mock：

```ts
vi.mock("fs/promises", () => ({
  readFile: vi.fn((filePath: string) => {
    const data = fileMap.get(filePath);
    if (data === undefined) {
      const err = new Error("ENOENT") as any;
      err.code = "ENOENT";
      return Promise.reject(err);
    }
    return Promise.resolve(data);
  }),
  writeFile: vi.fn((filePath: string, data: string) => {
    fileMap.set(filePath, data);
    return Promise.resolve(undefined);
  }),
  appendFile: vi.fn((filePath: string, data: string) => {
    const existing = fileMap.get(filePath) || "";
    fileMap.set(filePath, existing + data);
    return Promise.resolve(undefined);
  }),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
  readdir: vi.fn(() => Promise.resolve([])),
}));
```

Run: `cd plugins/finbot-market && npx vitest run src/tools/position-management.test.ts`
Expected: PASS

---

- [ ] **Step 3: Commit**

```bash
git add plugins/finbot-market/src/tools/position-management.ts plugins/finbot-market/src/tools/position-management.test.ts
git commit -m "feat(tools): 新增 updatePosition 持仓数据存储工具"
```

---

## Task 2: getPositionReport 工具

**Files:**
- Modify: `plugins/finbot-market/src/tools/position-management.ts`
- Modify: `plugins/finbot-market/src/tools/position-management.test.ts`

---

- [ ] **Step 4: Write the failing test for getPositionReport**

在 `position-management.test.ts` 中追加：

```ts
describe("getPositionReport tool", () => {
  let updateTool: ReturnType<typeof createUpdatePositionTool>;
  let reportTool: ReturnType<typeof createGetPositionReportTool>;

  beforeEach(() => {
    updateTool = createUpdatePositionTool();
    reportTool = createGetPositionReportTool();
    fileMap = new Map();
    vi.clearAllMocks();
  });

  it("tool metadata correct", () => {
    expect(reportTool.name).toBe("getPositionReport");
    expect(reportTool.parameters).toBeDefined();
  });

  it("returns error when no data exists", async () => {
    const result = await reportTool.execute("tc1", { date: "2026-05-12" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("未找到");
  });

  it("generates report with holdings only (no previous day)", async () => {
    await updateTool.execute("tc1", {
      date: "2026-05-12",
      holdings: [sampleHolding],
      trades: [sampleTrade],
      summary: sampleSummary,
    });

    const result = await reportTool.execute("tc2", { date: "2026-05-12" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("510310");
    expect(parsed.text).toContain("沪深300ETF易方达");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("detects position changes between two days", async () => {
    const holdingDay1 = { ...sampleHolding, quantity: 200 };
    await updateTool.execute("tc1", {
      date: "2026-05-11",
      holdings: [holdingDay1],
      trades: [],
      summary: { ...sampleSummary, totalAsset: 120000, positionRatio: 0.92 },
    });

    await updateTool.execute("tc2", {
      date: "2026-05-12",
      holdings: [sampleHolding],
      trades: [sampleTrade],
      summary: sampleSummary,
    });

    const result = await reportTool.execute("tc3", { date: "2026-05-12" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("+400");
    expect(parsed.text).toContain("买入");
  });

  it("uses latest date when no date provided", async () => {
    await updateTool.execute("tc1", {
      date: "2026-05-12",
      holdings: [sampleHolding],
      trades: [],
      summary: sampleSummary,
    });

    const result = await reportTool.execute("tc2", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("2026-05-12");
  });
});
```

Run: `cd plugins/finbot-market && npx vitest run src/tools/position-management.test.ts`
Expected: FAIL — `createGetPositionReportTool` not exported

---

- [ ] **Step 5: Implement getPositionReport tool**

在 `position-management.ts` 中追加：

```ts
const GetPositionReportSchema = {
  type: "object" as const,
  properties: {
    date: {
      type: "string" as const,
      description: "日期，如 2026-05-12。默认取最新记录。",
    },
  },
};

async function loadRecord(date: string): Promise<DailyRecord | null> {
  try {
    const data = await fs.readFile(getDateFilePath(date), "utf-8");
    return JSON.parse(data) as DailyRecord;
  } catch {
    return null;
  }
}

async function loadLatestRecord(): Promise<DailyRecord | null> {
  try {
    const data = await fs.readFile(getLatestPath(), "utf-8");
    return JSON.parse(data) as DailyRecord;
  } catch {
    return null;
  }
}

async function findPreviousDate(currentDate: string): Promise<string | null> {
  try {
    const files = await fs.readdir(DATA_DIR);
    const dates = files
      .filter((f) => f.endsWith(".json") && f !== "latest.json")
      .map((f) => f.replace(".json", ""))
      .filter((d) => d < currentDate)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  } catch {
    return null;
  }
}

function calculateChanges(current: DailyRecord, previous: DailyRecord): Array<{
  symbol: string;
  name: string;
  quantityChange: number;
  marketValueChange: number;
  reason: string;
}> {
  const prevMap = new Map(previous.holdings.map((h) => [h.symbol, h]));
  const currMap = new Map(current.holdings.map((h) => [h.symbol, h]));
  const changes: Array<{ symbol: string; name: string; quantityChange: number; marketValueChange: number; reason: string }> = [];

  for (const [symbol, curr] of currMap) {
    const prev = prevMap.get(symbol);
    if (prev) {
      const qtyChange = curr.quantity - prev.quantity;
      const mvChange = curr.marketValue - prev.marketValue;
      if (qtyChange !== 0) {
        const direction = qtyChange > 0 ? "买入" : "卖出";
        changes.push({
          symbol,
          name: curr.name,
          quantityChange: qtyChange,
          marketValueChange: mvChange,
          reason: `${direction} ${Math.abs(qtyChange)} 股`,
        });
      }
    } else {
      changes.push({
        symbol,
        name: curr.name,
        quantityChange: curr.quantity,
        marketValueChange: curr.marketValue,
        reason: "新开仓",
      });
    }
  }

  for (const [symbol, prev] of prevMap) {
    if (!currMap.has(symbol)) {
      changes.push({
        symbol,
        name: prev.name,
        quantityChange: -prev.quantity,
        marketValueChange: -prev.marketValue,
        reason: "清仓",
      });
    }
  }

  return changes;
}

function formatReport(current: DailyRecord, previous: DailyRecord | null): string {
  const lines: string[] = [
    `## 持仓日报（${current.date}）`,
    "",
  ];

  // Account summary
  const cs = current.summary;
  lines.push("### 账户概览");
  lines.push("| 指标 | 数值 |");
  lines.push("|------|------|");
  lines.push(`| 总资产 | ${cs.totalAsset.toFixed(2)} |`);
  lines.push(`| 持仓市值 | ${(cs.holdingMarketValue ?? 0).toFixed(2)} |`);
  lines.push(`| 当日盈亏 | ${(cs.dailyProfit ?? 0).toFixed(2)} |`);
  lines.push(`| 可用资金 | ${(cs.availableCash ?? 0).toFixed(2)} |`);
  lines.push(`| 仓位 | ${(cs.positionRatio * 100).toFixed(2)}% |`);

  if (previous) {
    const ps = previous.summary;
    lines.push("");
    lines.push("| 指标 | 今日 | 昨日 | 变化 |");
    lines.push("|------|------|------|------|");
    lines.push(`| 总资产 | ${cs.totalAsset.toFixed(2)} | ${ps.totalAsset.toFixed(2)} | ${(cs.totalAsset - ps.totalAsset).toFixed(2)} |`);
    lines.push(`| 持仓市值 | ${(cs.holdingMarketValue ?? 0).toFixed(2)} | ${(ps.holdingMarketValue ?? 0).toFixed(2)} | ${((cs.holdingMarketValue ?? 0) - (ps.holdingMarketValue ?? 0)).toFixed(2)} |`);
    lines.push(`| 仓位 | ${(cs.positionRatio * 100).toFixed(2)}% | ${(ps.positionRatio * 100).toFixed(2)}% | ${((cs.positionRatio - ps.positionRatio) * 100).toFixed(2)}% |`);
  }

  // Holdings
  lines.push("");
  lines.push("### 持仓明细");
  lines.push("| 代码 | 名称 | 数量 | 市值 | 盈亏 | 占比 |");
  lines.push("|------|------|------|------|------|------|");
  const totalMv = cs.holdingMarketValue ?? current.holdings.reduce((s, h) => s + h.marketValue, 0);
  for (const h of current.holdings) {
    const ratio = totalMv > 0 ? (h.marketValue / totalMv * 100).toFixed(2) + "%" : "0%";
    const profitStr = h.profit !== undefined ? `${h.profit >= 0 ? "+" : ""}${h.profit.toFixed(2)}` : "N/A";
    lines.push(`| ${h.symbol} | ${h.name} | ${h.quantity} | ${h.marketValue.toFixed(2)} | ${profitStr} | ${ratio} |`);
  }

  // Trades
  if (current.trades.length > 0) {
    lines.push("");
    lines.push("### 今日调仓");
    lines.push("| 时间 | 代码 | 方向 | 价格 | 数量 | 金额 |");
    lines.push("|------|------|------|------|------|------|");
    for (const t of current.trades) {
      const dir = t.direction === "buy" ? "买入" : "卖出";
      lines.push(`| ${t.time || "-"} | ${t.symbol} | ${dir} | ${t.price.toFixed(3)} | ${t.quantity} | ${(t.amount ?? t.price * t.quantity).toFixed(2)} |`);
    }
  }

  // Position changes
  if (previous) {
    const changes = calculateChanges(current, previous);
    if (changes.length > 0) {
      lines.push("");
      lines.push("### 持仓变化");
      for (const c of changes) {
        lines.push(`- **${c.symbol} | ${c.name}**：${c.reason}，数量变化 ${c.quantityChange >= 0 ? "+" : ""}${c.quantityChange}`);
      }
    }
  }

  lines.push("");
  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export function createGetPositionReportTool(): AnyAgentTool {
  return {
    name: "getPositionReport",
    label: "持仓报告",
    description: "获取指定日期的持仓报告。若历史记录存在，自动对比前一日生成调仓分析。",
    parameters: GetPositionReportSchema,
    execute: async (_toolCallId, params) => {
      try {
        const { date } = params as { date?: string };

        let current: DailyRecord | null;
        if (date) {
          current = await loadRecord(date);
        } else {
          current = await loadLatestRecord();
        }

        if (!current) {
          return toToolResult({
            content: date ? `未找到 ${date} 的持仓记录` : "未找到任何持仓记录",
            isError: true,
          });
        }

        const targetDate = current.date;
        const prevDate = await findPreviousDate(targetDate);
        const previous = prevDate ? await loadRecord(prevDate) : null;

        const report = formatReport(current, previous);
        return toToolResult({ content: report });
      } catch (error) {
        return toToolResult({
          content: `生成报告失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
```

Run: `cd plugins/finbot-market && npx vitest run src/tools/position-management.test.ts`
Expected: PASS

---

- [ ] **Step 6: Commit**

```bash
git add plugins/finbot-market/src/tools/position-management.ts plugins/finbot-market/src/tools/position-management.test.ts
git commit -m "feat(tools): 新增 getPositionReport 持仓报告生成工具"
```

---

## Task 3: 注册工具

**Files:**
- Modify: `plugins/finbot-market/src/index.ts`
- Modify: `plugins/finbot-market/openclaw.plugin.json`

---

- [ ] **Step 7: Register tools in index.ts**

在 `plugins/finbot-market/src/index.ts` 新增 import 和 register：

```ts
import { createUpdatePositionTool, createGetPositionReportTool } from "./tools/position-management.js";
```

在 `register` 函数末尾新增：
```ts
api.registerTool(createUpdatePositionTool());
api.registerTool(createGetPositionReportTool());
```

- [ ] **Step 8: Register tools in openclaw.plugin.json**

在 `contracts.tools` 数组中追加：
```json
"updatePosition",
"getPositionReport"
```

- [ ] **Step 9: Type check**

Run: `cd plugins/finbot-market && npx tsc --noEmit`
Expected: PASS（无类型错误）

- [ ] **Step 10: Commit**

```bash
git add plugins/finbot-market/src/index.ts plugins/finbot-market/openclaw.plugin.json
git commit -m "feat(tools): 注册 updatePosition/getPositionReport 工具"
```

---

## Task 4: 创建 OpenClaw Skill

**Files:**
- Create: `skills/position-management/SKILL.md`

---

- [ ] **Step 11: Write position-management skill**

`skills/position-management/SKILL.md`:

```markdown
---
name: position-management
description: FinBot 仓位管理 Skill：指导 Agent 识别用户持仓/成交截图，提取结构化数据，调用 updatePosition/getPositionReport 工具存储和生成报告。
---

# FinBot 仓位管理 Skill

## 适用范围

当用户发送持仓截图或成交截图时生效，包括：
- 消息包含"持仓"、"仓位"、"成交"、"今日操作"、"更新持仓"等关键词
- 消息附带券商 APP 截图（持仓页或成交页）
- 用户明确说"记录今天的仓位"、"汇报持仓"

## 工作流程

### 1. 识别图片类型

**持仓截图特征**：
- 包含"总资产"、"持仓市值"、"当日盈亏"、"仓位"等字样
- 表格列通常有：名称/代码、持仓数量、成本价、现价、市值、盈亏

**成交截图特征**：
- 包含"成交时间"、"买入"、"卖出"、"成交额"等字样
- 表格列通常有：时间、证券名称、价格/数量、方向、金额

### 2. 提取结构化数据

从持仓截图中提取：
- `symbol`：6 位数字代码（如 510310）
- `name`：证券名称（如 沪深300ETF易方达）
- `quantity`：持仓数量
- `availableQuantity`：可用数量（如与持仓数量相同则填相同值）
- `costPrice`：成本价
- `currentPrice`：现价
- `marketValue`：市值
- `profit`：持仓盈亏金额
- `profitPercent`：持仓盈亏百分比（转换为小数，如 -0.66% → -0.0066）

从成交截图中提取：
- `time`：成交时间（如 09:33:05）
- `symbol`：代码
- `name`：名称
- `direction`：买入或卖出
- `price`：成交价
- `quantity`：成交数量
- `amount`：成交额

从截图顶部提取账户汇总：
- `totalAsset`：总资产
- `dailyProfit`：当日盈亏
- `availableCash`：可用资金
- `holdingMarketValue`：持仓市值
- `holdingProfit`：持仓盈亏（累计）
- `positionRatio`：仓位比例（小数，如 95.41% → 0.9541）

### 3. 数据校验

提取后必须进行以下校验，不通过时向用户指出异常：
- `quantity * currentPrice` 应约等于 `marketValue`（允许 ±5% 误差，因四舍五入）
- `price * quantity` 应约等于 `amount`（成交记录）
- 所有代码应为 6 位数字

### 4. 向用户确认

提取完成后，向用户展示关键数据摘要：
```
我已从截图中提取到以下持仓数据：
- 日期：2026-05-12
- 持仓标的：6 只
- 总资产：124,607.15
- 当日成交：5 笔

请确认数据是否正确？（回复"确认"即可存储）
```

用户回复"确认"、"对"、"是的"等后，再调用工具。

### 5. 调用工具

用户确认后，按以下顺序调用：

1. `updatePosition(date, holdings, trades, summary)` — 存储数据
2. `getPositionReport(date)` — 生成对比报告

### 6. 输出规范

- 报告使用 Markdown 表格展示持仓明细
- 有历史记录时展示对比变化
- 末尾必须附加 `⚠️ 不构成投资建议`

## 错误处理

- 截图无法识别 → 请用户以文字/表格形式发送持仓数据
- 数据校验失败 → 指出异常字段，请用户核对
- 用户未确认 → 不调用工具，等待用户确认

## 禁忌

- ❌ 不要在用户未确认前直接存储数据
- ❌ 不要泄露用户具体金额给第三方（所有数据本地存储）
- ❌ 不要给出明确的买入/卖出建议（只能提供分析框架）
```

- [ ] **Step 12: Commit**

```bash
git add skills/position-management/SKILL.md
git commit -m "feat(skill): 新增 position-management Skill 指导 Agent 解析持仓截图"
```

---

## Task 5: 全量测试

- [ ] **Step 13: Run full test suite**

Run: `cd plugins/finbot-market && npm run test:ci`
Expected: ALL PASS

- [ ] **Step 14: Commit (if any changes)**

如有测试修复，提交：
```bash
git add ...
git commit -m "test(position): 补充仓位管理工具测试"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] `updatePosition` 存储持仓数据 → Task 1
- [x] `getPositionReport` 生成报告 → Task 2
- [x] 调仓检测逻辑（对比前日持仓）→ Task 2 Step 5
- [x] 数据校验 → Skill 文档
- [x] 用户确认流程 → Skill 文档
- [x] 注册到 index.ts 和 plugin.json → Task 3
- [x] OpenClaw Skill 创建 → Task 4

### Placeholder Scan
- [x] 无 TBD/TODO
- [x] 所有步骤含具体代码和命令
- [x] 所有函数签名在测试中已定义

### Type Consistency
- [x] `Holding` / `Trade` / `AccountSummary` / `DailyRecord` — 测试和实现一致
- [x] Schema 使用 `as const` 断言
- [x] `direction` 枚举值为 `"buy" | "sell"`
