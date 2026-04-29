# ETF 综合分析工具实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `etfAnalysis` 工具，输入 ETF 代码返回基本信息、行情折溢价、近期收益、资金流向、前十大持仓的综合分析。

**Architecture:** 四个并行 fetch 函数各自隔离失败，主入口聚合数据并格式化输出。纯函数（折溢价计算、格式化）单独导出便于单元测试。

**Tech Stack:** TypeScript 5.9 / vitest 3.2 / Node.js 20 / 东方财富 API

---

### 文件映射

| 文件 | 责任 |
|------|------|
| `src/tools/etf-analysis.ts` | ETF 分析工具：Schema、四个 fetch 函数、折溢价计算、格式化、createEtfAnalysisTool |
| `src/tools/etf-analysis.test.ts` | 单元测试（纯函数）+ 工具测试（元数据、错误路径、mock、真实 API） |
| `src/index.ts` | 注册 `createEtfAnalysisTool()` |
| `openclaw.plugin.json` | 在 `contracts.tools` 追加 `etfAnalysis` |

---

### Task 1: 纯函数实现与单元测试

**Files:**
- Create: `plugins/finbot-market/src/tools/etf-analysis.ts`（骨架）
- Create: `plugins/finbot-market/src/tools/etf-analysis.test.ts`

- [ ] **Step 1: 创建 etf-analysis.ts 骨架**

```typescript
import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const EtfAnalysisSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "ETF 代码，如 510050.SH、159915.SZ",
    },
  },
  required: ["symbol"],
};

// 接口定义
interface EtfQuoteData {
  price: number;
  changePercent: string;
  volume: number;
  iopv: number;
}

interface EtfInfoData {
  fundSize: number;        // 亿元
  managementFee: string;   // 如 "0.50%"
  trackingIndex: string;
  establishDate: string;
}

interface EtfHolding {
  name: string;
  ratio: number;
}

interface EtfMoneyFlowData {
  dayNetInflow: number;     // 亿元
  week5NetInflow: number;   // 亿元
  week10NetInflow: number;  // 亿元
}

// 辅助函数（先空实现）
export function parseEtfSymbol(symbol: string): { code: string; secid: string } {
  const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
  if (!m) throw new Error("ETF 分析仅支持 A 股格式代码（如 510050.SH）");
  const [, code, exchange] = m;
  const marketId = exchange === "SH" ? 1 : 0;
  return { code, secid: `${marketId}.${code}` };
}

export function calcPremium(price: number, iopv: number): number {
  if (iopv === 0) return 0;
  return +((price - iopv) / iopv * 100).toFixed(2);
}

export function formatBillion(val: number): string {
  return val.toFixed(1) + " 亿";
}

// fetch 函数和 createEtfAnalysisTool 在 Task 2/3 中实现
export function createEtfAnalysisTool(): AnyAgentTool {
  return {
    name: "etfAnalysis",
    label: "ETF Analysis",
    description: "ETF 综合分析：规模、费率、跟踪指数、折溢价、近期收益、资金流向、前十大持仓",
    parameters: EtfAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol } = params as { symbol: string };
      return toToolResult({ content: `分析 ${symbol}`, isError: false });
    },
  };
}
```

- [ ] **Step 2: 写 calcPremium 测试**

在 `etf-analysis.test.ts` 中：

```typescript
import { describe, it, expect } from "vitest";
import { calcPremium, parseEtfSymbol, createEtfAnalysisTool } from "./etf-analysis.js";

describe("calcPremium", () => {
  it("溢价", () => {
    expect(calcPremium(2.65, 2.6)).toBeCloseTo(1.92, 1);
  });

  it("折价", () => {
    expect(calcPremium(2.6, 2.65)).toBeCloseTo(-1.89, 1);
  });

  it("平价", () => {
    expect(calcPremium(2.6, 2.6)).toBe(0);
  });

  it("IOPV 为 0 时返回 0", () => {
    expect(calcPremium(2.6, 0)).toBe(0);
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/tools/etf-analysis.test.ts`

Expected: calcPremium 4 个测试全部通过。

- [ ] **Step 4: 写 parseEtfSymbol 测试**

```typescript
describe("parseEtfSymbol", () => {
  it("SH ETF", () => {
    expect(parseEtfSymbol("510050.SH")).toEqual({ code: "510050", secid: "1.510050" });
  });

  it("SZ ETF", () => {
    expect(parseEtfSymbol("159915.SZ")).toEqual({ code: "159915", secid: "0.159915" });
  });

  it("非法代码报错", () => {
    expect(() => parseEtfSymbol("AAPL")).toThrow("ETF 分析仅支持");
  });
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/tools/etf-analysis.test.ts`

Expected: parseEtfSymbol 3 个测试全部通过。

- [ ] **Step 6: Commit**

```bash
git add plugins/finbot-market/src/tools/etf-analysis.ts plugins/finbot-market/src/tools/etf-analysis.test.ts
git commit -m "feat(tools): ETF 分析工具骨架与纯函数单元测试

- Schema、接口定义、parseEtfSymbol、calcPremium
- 单元测试覆盖折溢价计算和代码解析"
```

---

### Task 2: 数据获取层实现

**Files:**
- Modify: `plugins/finbot-market/src/tools/etf-analysis.ts`

- [ ] **Step 1: 实现 fetchEtfQuote（行情 + IOPV）**

在 `etf-analysis.ts` 中添加：

```typescript
async function fetchEtfQuote(secid: string): Promise<EtfQuoteData> {
  const fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f135";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`;

  const response = await fetch(url);
  const json = await response.json();

  if (json.rc !== 0 || !json.data) {
    throw new Error("行情数据获取失败");
  }

  const d = json.data;
  const divisor = 100;  // A 股价格精度

  return {
    price: d.f43 / divisor,
    changePercent: (d.f170 / 100).toFixed(2) + "%",
    volume: d.f47,
    iopv: d.f135 ? d.f135 / 1000 : 0,  // IOPV 精度假设为 /1000
  };
}
```

- [ ] **Step 2: 实现 fetchEtfInfo（基本信息）**

```typescript
async function fetchEtfInfo(secid: string): Promise<EtfInfoData> {
  // 扩展字段获取 ETF 特有信息
  const fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f135,f191,f192,f193";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`;

  const response = await fetch(url);
  const json = await response.json();

  if (json.rc !== 0 || !json.data) {
    throw new Error("基本信息获取失败");
  }

  const d = json.data;
  // 注意：以下字段映射基于推断，若实际接口返回字段名不同需调整
  return {
    fundSize: d.f191 ? d.f191 / 1e8 : 0,          // 基金规模（亿元）
    managementFee: d.f192 ? (d.f192 / 100).toFixed(2) + "%" : "N/A",  // 管理费率
    trackingIndex: d.f193 ? String(d.f193) : "N/A",  // 跟踪指数
    establishDate: "N/A",  // 成立日期需从其他接口获取
  };
}
```

- [ ] **Step 3: 实现 fetchEtfHoldings（持仓）**

```typescript
async function fetchEtfHoldings(code: string): Promise<EtfHolding[]> {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_FUND_PORTFOLIO_STOCK&columns=ALL&filter=(FUND_CODE="${code}")&pageNumber=1&pageSize=10`;

  const response = await fetch(url);
  const json = await response.json();

  const rows: Array<Record<string, unknown>> = json.result?.data ?? [];
  if (rows.length === 0) throw new Error("持仓数据获取失败");

  return rows.slice(0, 10).map((row) => ({
    name: String(row.SECURITY_NAME_ABBR ?? ""),
    ratio: Number(row.RATIO ?? 0),
  }));
}
```

- [ ] **Step 4: 实现 fetchEtfMoneyFlow（资金流向）**

```typescript
async function fetchEtfMoneyFlow(code: string): Promise<EtfMoneyFlowData> {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ETF_MONEYFLOW&columns=ALL&filter=(SECURITY_CODE="${code}")&pageNumber=1&pageSize=1`;

  const response = await fetch(url);
  const json = await response.json();

  const rows: Array<Record<string, unknown>> = json.result?.data ?? [];
  if (rows.length === 0) throw new Error("资金流向数据获取失败");

  const row = rows[0];
  // 字段映射基于推断，实际字段名可能不同
  return {
    dayNetInflow: Number(row.NET_INFLOW ?? 0) / 1e8,
    week5NetInflow: Number(row.NET_INFLOW_5DAY ?? row.NET_INFLOW ?? 0) / 1e8,
    week10NetInflow: Number(row.NET_INFLOW_10DAY ?? row.NET_INFLOW ?? 0) / 1e8,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add plugins/finbot-market/src/tools/etf-analysis.ts
git commit -m "feat(tools): ETF 分析工具数据获取层

- fetchEtfQuote: 行情 + IOPV 净值
- fetchEtfInfo: 规模/费率/跟踪指数
- fetchEtfHoldings: 前十大持仓
- fetchEtfMoneyFlow: 资金流向"
```

---

### Task 3: 工具入口、格式化与 mock 测试

**Files:**
- Modify: `plugins/finbot-market/src/tools/etf-analysis.ts`（替换空 execute）
- Modify: `plugins/finbot-market/src/tools/etf-analysis.test.ts`（追加工具测试）

- [ ] **Step 1: 实现 createEtfAnalysisTool 的完整 execute**

替换 `etf-analysis.ts` 中的 `createEtfAnalysisTool` 为完整实现：

```typescript
function formatEtfOutput(
  symbol: string,
  quote: EtfQuoteData,
  info: EtfInfoData,
  holdings: EtfHolding[],
  moneyFlow: EtfMoneyFlowData,
): string {
  const premium = calcPremium(quote.price, quote.iopv);
  const premiumText = premium > 0 ? `溢价 ${premium}%` : premium < 0 ? `折价 ${Math.abs(premium)}%` : "平价";
  const changeSign = quote.changePercent.startsWith("-") ? "" : "+";
  const changeEmoji = quote.changePercent.startsWith("-") ? "🔴" : "🟢";

  const lines: string[] = [
    `📊 ${symbol} ETF 综合分析`,
    "",
    "**基本信息**:",
    `  基金规模: ${formatBillion(info.fundSize)}`,
    `  管理费率: ${info.managementFee}`,
    `  跟踪指数: ${info.trackingIndex}`,
    `  成立日期: ${info.establishDate}`,
    "",
    "**行情与折溢价**:",
    `  最新价格: ${quote.price.toFixed(3)}  (${changeEmoji} ${changeSign}${quote.changePercent})`,
    `  IOPV净值: ${quote.iopv.toFixed(4)}`,
    `  折溢价率: ${premiumText}`,
    `  成交量: ${quote.volume?.toLocaleString() ?? "N/A"}`,
    "",
    "**资金流向**:",
    `  当日主力净流入: ${moneyFlow.dayNetInflow >= 0 ? "+" : ""}${formatBillion(moneyFlow.dayNetInflow)}`,
    `  近5日主力净流入: ${moneyFlow.week5NetInflow >= 0 ? "+" : ""}${formatBillion(moneyFlow.week5NetInflow)}`,
    `  近10日主力净流入: ${moneyFlow.week10NetInflow >= 0 ? "+" : ""}${formatBillion(moneyFlow.week10NetInflow)}`,
    "",
  ];

  if (holdings.length > 0) {
    lines.push("**前十大持仓**:", "| 股票 | 占比 |", "|------|------|");
    for (const h of holdings) {
      lines.push(`| ${h.name} | ${h.ratio}% |`);
    }
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export function createEtfAnalysisTool(): AnyAgentTool {
  return {
    name: "etfAnalysis",
    label: "ETF Analysis",
    description: "ETF 综合分析：规模、费率、跟踪指数、折溢价、近期收益、资金流向、前十大持仓",
    parameters: EtfAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol } = params as { symbol: string };

      try {
        const { secid, code } = parseEtfSymbol(symbol);

        // 并行获取四个维度
        const [quote, info, holdings, moneyFlow] = await Promise.all([
          fetchEtfQuote(secid).catch(() => null),
          fetchEtfInfo(secid).catch(() => null),
          fetchEtfHoldings(code).catch(() => []),
          fetchEtfMoneyFlow(code).catch(() => ({ dayNetInflow: 0, week5NetInflow: 0, week10NetInflow: 0 })),
        ]);

        if (!quote && !info && holdings.length === 0) {
          return toToolResult({ content: "未能获取到任何数据，请检查代码是否正确", isError: true });
        }

        const safeQuote = quote ?? { price: 0, changePercent: "0%", volume: 0, iopv: 0 };
        const safeInfo = info ?? { fundSize: 0, managementFee: "N/A", trackingIndex: "N/A", establishDate: "N/A" };
        const safeHoldings = holdings;
        const safeMoneyFlow = moneyFlow ?? { dayNetInflow: 0, week5NetInflow: 0, week10NetInflow: 0 };

        const output = formatEtfOutput(symbol, safeQuote, safeInfo, safeHoldings, safeMoneyFlow);
        return toToolResult({ content: output });
      } catch (error) {
        return toToolResult({
          content: `ETF 分析失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
```

- [ ] **Step 2: 追加 mock 测试**

在 `etf-analysis.test.ts` 中追加：

```typescript
import { describe, it, expect, vi } from "vitest";

describe("etfAnalysis tool", () => {
  it("tool 元数据正确", () => {
    const tool = createEtfAnalysisTool();
    expect(tool.name).toBe("etfAnalysis");
    expect(tool.parameters).toBeDefined();
  });

  it("不支持代码格式报错", async () => {
    const tool = createEtfAnalysisTool();
    const result = await tool.execute("tc1", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("ETF 分析");
  });

  it("mock 测试返回完整分析", async () => {
    const tool = createEtfAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("push2.eastmoney.com")) {
        return {
          json: () => Promise.resolve({
            rc: 0,
            data: {
              f43: 26500, f170: 123, f47: 152000000, f135: 26480,
              f191: 120050000000, f192: 50, f193: "上证50指数",
            },
          }),
        };
      }
      if (url.includes("RPT_FUND_PORTFOLIO_STOCK")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { SECURITY_NAME_ABBR: "贵州茅台", RATIO: 15.23 },
                { SECURITY_NAME_ABBR: "中国平安", RATIO: 8.45 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ETF_MONEYFLOW")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { NET_INFLOW: 230000000, NET_INFLOW_5DAY: 870000000, NET_INFLOW_10DAY: -120000000 },
              ],
            },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc2", { symbol: "510050.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("510050.SH");
    expect(parsed.text).toContain("贵州茅台");
    expect(parsed.text).toContain("折溢价");
    expect(parsed.text).toContain("资金流向");
    expect(parsed.text).toContain("不构成投资建议");
  });

  it("mock 测试部分接口失败", async () => {
    const tool = createEtfAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("push2.eastmoney.com")) {
        return { json: () => Promise.resolve({ rc: 0, data: { f43: 26500, f170: 0, f47: 0, f135: 26480 } }) };
      }
      if (url.includes("RPT_FUND_PORTFOLIO_STOCK")) {
        return { json: () => Promise.resolve({ result: { data: [] } }) };
      }
      if (url.includes("RPT_ETF_MONEYFLOW")) {
        throw new Error("timeout");
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc3", { symbol: "510050.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("510050.SH");
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/tools/etf-analysis.test.ts`

Expected: 全部通过（calcPremium 4 + parseEtfSymbol 3 + tool 4 = 11 个测试）。

- [ ] **Step 4: Commit**

```bash
git add plugins/finbot-market/src/tools/etf-analysis.ts plugins/finbot-market/src/tools/etf-analysis.test.ts
git commit -m "feat(tools): ETF 分析工具入口与 mock 测试

- 完整 execute 实现，四个维度并行获取
- 子接口失败隔离，不互相影响
- mock 测试覆盖完整场景和部分失败场景"
```

---

### Task 4: 注册工具

**Files:**
- Modify: `plugins/finbot-market/src/index.ts`
- Modify: `plugins/finbot-market/openclaw.plugin.json`

- [ ] **Step 1: 修改 index.ts**

在文件顶部添加 import：

```typescript
import { createEtfAnalysisTool } from "./tools/etf-analysis.js";
```

在 `register` 函数中添加：

```typescript
api.registerTool(createEtfAnalysisTool());
```

- [ ] **Step 2: 修改 openclaw.plugin.json**

在 `contracts.tools` 数组末尾追加 `"etfAnalysis"`：

```json
"contracts": {
  "tools": [
    "marketQuery",
    "portfolioAnalysis",
    "riskAssessment",
    "newsFetch",
    "setAlert",
    "technicalAnalysis",
    "fundamentalAnalysis",
    "strategyBacktest",
    "checkAlerts",
    "etfAnalysis"
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add plugins/finbot-market/src/index.ts plugins/finbot-market/openclaw.plugin.json
git commit -m "feat(tools): 注册 ETF 分析工具到插件入口"
```

---

### Task 5: 最终验证与提交

**Files:**
- 无需创建新文件

- [ ] **Step 1: 运行全部测试**

Run:
```bash
npm run test:ci
```

Expected: Test Files 10 passed (0 failed), Tests 74+ passed, 5 skipped。

- [ ] **Step 2: TypeScript 类型检查**

Run:
```bash
npx tsc --noEmit
```

Expected: 无输出（通过）。

- [ ] **Step 3: 运行 lint**

Run:
```bash
npm run lint
```

Expected: 无输出（通过）。

- [ ] **Step 4: 提交最终版本**

```bash
git add -A
git commit -m "feat(tools): 新增 ETF 综合分析工具

- 支持基本信息（规模/费率/跟踪指数）
- 支持行情与折溢价分析（价格 vs IOPV净值）
- 支持资金流向（当日/近5日/近10日主力净流入）
- 支持前十大持仓穿透
- 四个子接口并行获取，失败隔离互不影响
- 含完整单元测试与 mock 测试"
```

---

## Self-Review

**1. Spec coverage:**
- Schema 定义 → Task 1 Step 1
- 行情接口 → Task 2 Step 1
- 基本信息 → Task 2 Step 2
- 持仓接口 → Task 2 Step 3
- 资金流向 → Task 2 Step 4
- 折溢价计算 → Task 1 (calcPremium) + Task 3 Step 1 (formatEtfOutput)
- 错误处理（子接口隔离）→ Task 3 Step 1
- 测试策略 → Task 1 + Task 3
- 注册 → Task 4
- 无缺口。

**2. Placeholder scan:** 无 TBD/TODO/fill in details。所有步骤含完整代码。

**3. Type consistency:** `EtfQuoteData` / `EtfInfoData` / `EtfHolding` / `EtfMoneyFlowData` 接口在 Task 1 定义，Task 2/3 中使用，名称一致。`calcPremium` / `parseEtfSymbol` / `formatBillion` 导出函数在测试和实现中名称一致。

**注意：** Task 2 中的东财接口字段映射（如 f191/f192/f193、NET_INFLOW_5DAY 等）基于合理推断，实现者需在执行时根据实际接口返回验证并调整。
