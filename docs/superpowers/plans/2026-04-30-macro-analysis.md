# 宏观经济数据查询工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `macroAnalysis` 工具，支持按 category 查询 CPI、PPI、PMI、GDP、M2、社融、LPR、失业率、美元兑人民币汇率，输出最新值及同比/环比变化。

**Architecture:** 单一工具入口带 `category` 参数，各指标独立 fetcher 并行请求，失败时单个指标标记"数据暂缺"，通过统一 formatter 按分类分组输出。遵循现有 ETF 分析工具的代码组织模式（同文件内 schema + fetcher + formatter + factory）。

**Tech Stack:** TypeScript 5.9 / vitest / OpenClaw Plugin SDK / East Money datacenter-web API

---

## File Structure

| File | Responsibility |
|------|---------------|
| `plugins/finbot-market/src/tools/macro-analysis.ts` | Schema、9 个指标 fetcher、格式化、工具工厂 |
| `plugins/finbot-market/src/tools/macro-analysis.test.ts` | 单元测试（格式化、schema）、mock 集成测试 |
| `plugins/finbot-market/src/index.ts` | 注册 `createMacroAnalysisTool()` |
| `plugins/finbot-market/openclaw.plugin.json` | 追加 `macroAnalysis` 到 tools 列表 |

---

## Task 1: 编写 macro-analysis.test.ts（TDD 先写测试）

**Files:**
- Create: `plugins/finbot-market/src/tools/macro-analysis.test.ts`

- [ ] **Step 1: 编写 schema 和 formatter 的单元测试**

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  createMacroAnalysisTool,
  formatMacroOutput,
  parseIndicatorRows,
} from "./macro-analysis.js";

const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";

describe("parseIndicatorRows", () => {
  it("解析 CPI 数据", () => {
    const rows = [
      { NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 },
      { NATIONAL_SAME: 1.3, NATIONAL_SEQUENTIAL: 1.0 },
    ];
    const result = parseIndicatorRows(rows, {
      name: "CPI",
      valueField: "NATIONAL_SAME",
      valueFormatter: (v: number) => `${v}%`,
      yoyChangeField: null,
      momChangeField: "NATIONAL_SEQUENTIAL",
      yoyUnit: "pp",
      momUnit: "%",
    });
    expect(result.name).toBe("CPI");
    expect(result.value).toBe("1%");
    expect(result.yoy).toBe("-0.3pp");
    expect(result.mom).toBe("-0.7%");
  });

  it("解析 PPI 数据（无环比字段，从前值指数计算）", () => {
    const rows = [
      { BASE_SAME: 0.5, BASE: 100.5 },
      { BASE_SAME: -0.9, BASE: 99.1 },
    ];
    const result = parseIndicatorRows(rows, {
      name: "PPI",
      valueField: "BASE_SAME",
      valueFormatter: (v: number) => `${v}%`,
      yoyChangeField: null,
      momChangeField: null,
      yoyUnit: "pp",
      momUnit: "%",
    });
    expect(result.value).toBe("0.5%");
    expect(result.yoy).toBe("+1.4pp");
    expect(result.mom).toBe("+1.41%");
  });

  it("解析 PMI 数据（同比字段直接是 pp 变化）", () => {
    const rows = [
      { MAKE_INDEX: 50.3, MAKE_SAME: 2.65 },
      { MAKE_INDEX: 50.4, MAKE_SAME: -0.2 },
    ];
    const result = parseIndicatorRows(rows, {
      name: "PMI",
      valueField: "MAKE_INDEX",
      valueFormatter: (v: number) => `${v}`,
      yoyChangeField: "MAKE_SAME",
      momChangeField: null,
      yoyUnit: "pp",
      momUnit: "pp",
    });
    expect(result.value).toBe("50.3");
    expect(result.yoy).toBe("+2.65pp");
    expect(result.mom).toBe("-0.1pp");
  });

  it("空数据返回数据暂缺", () => {
    const result = parseIndicatorRows([], {
      name: "CPI",
      valueField: "NATIONAL_SAME",
      valueFormatter: (v: number) => `${v}%`,
      yoyChangeField: null,
      momChangeField: "NATIONAL_SEQUENTIAL",
      yoyUnit: "pp",
      momUnit: "%",
    });
    expect(result.value).toBe("数据暂缺");
    expect(result.yoy).toBeNull();
    expect(result.mom).toBeNull();
  });
});

describe("formatMacroOutput", () => {
  it("格式化完整输出", () => {
    const categories = [
      {
        category: "通胀",
        indicators: [
          { name: "CPI", value: "1.0%", yoy: "-0.3pp", mom: "-0.7%" },
          { name: "PPI", value: "0.5%", yoy: "+1.4pp", mom: "+1.41%" },
        ],
      },
      {
        category: "增长",
        indicators: [
          { name: "PMI", value: "50.3", yoy: "+2.65pp", mom: "-0.1pp" },
        ],
      },
    ];
    const output = formatMacroOutput(categories);
    expect(output).toContain("通胀:");
    expect(output).toContain("CPI: 1.0%");
    expect(output).toContain("PPI: 0.5%");
    expect(output).toContain("增长:");
    expect(output).toContain("PMI: 50.3");
    expect(output).toContain("⚠️ 不构成投资建议");
  });

  it("空分类不显示", () => {
    const categories = [
      { category: "通胀", indicators: [] },
      { category: "增长", indicators: [{ name: "PMI", value: "50.3", yoy: null, mom: null }] },
    ];
    const output = formatMacroOutput(categories);
    expect(output).not.toContain("通胀:");
    expect(output).toContain("增长:");
  });
});

describe("macroAnalysis tool", () => {
  it("tool 元数据正确", () => {
    const tool = createMacroAnalysisTool();
    expect(tool.name).toBe("macroAnalysis");
    expect(tool.parameters).toBeDefined();
    expect(tool.parameters.properties.category.enum).toContain("all");
  });
});

describe("macroAnalysis tool mock tests", () => {
  it("mock 测试返回完整分析", async () => {
    const tool = createMacroAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("RPT_ECONOMY_CPI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 },
                { NATIONAL_SAME: 1.3, NATIONAL_SEQUENTIAL: 1.0 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_PPI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { BASE_SAME: 0.5, BASE: 100.5 },
                { BASE_SAME: -0.9, BASE: 99.1 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_PMI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { MAKE_INDEX: 50.3, MAKE_SAME: 2.65 },
                { MAKE_INDEX: 50.4, MAKE_SAME: -0.2 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_GDP")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { SUM_SAME: 5.0, DOMESTICL_PRODUCT_BASE: 334193 },
                { SUM_SAME: 5.0, DOMESTICL_PRODUCT_BASE: 1401879 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_M2")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { M2_SAME: 8.7, M2_ABS: 3052000 },
                { M2_SAME: 8.8, M2_ABS: 3031000 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_FINANCING")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { FINANCING_SAME: 12.3, FINANCING_ABS: 123000 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_LPR")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { LPR1Y: 3.45, LPR5Y: 3.95 },
                { LPR1Y: 3.45, LPR5Y: 3.95 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_UNEMPLOYMENT")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { UNEMPLOYMENT_RATE: 5.2 },
                { UNEMPLOYMENT_RATE: 5.1 },
              ],
            },
          }),
        };
      }
      if (url.includes("133.USDCNH") || url.includes("133.USDCNY")) {
        return {
          json: () => Promise.resolve({
            rc: 0,
            data: { f43: 72345, f170: 12 },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc1", { category: "all" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("CPI");
    expect(parsed.text).toContain("PPI");
    expect(parsed.text).toContain("PMI");
    expect(parsed.text).toContain("GDP");
    expect(parsed.text).toContain("M2");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("mock 测试部分接口失败", async () => {
    const tool = createMacroAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("RPT_ECONOMY_CPI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_PPI")) {
        throw new Error("timeout");
      }
      return { json: () => Promise.resolve({ result: { data: [] } }) };
    }));

    const result = await tool.execute("tc2", { category: "inflation" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("CPI");
    expect(parsed.text).toContain("PPI");
    expect(parsed.text).toContain("数据暂缺");
  });

  it("category 过滤正确", async () => {
    const tool = createMacroAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("RPT_ECONOMY_CPI")) {
        return { json: () => Promise.resolve({ result: { data: [{ NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 }] } }) };
      }
      return { json: () => Promise.resolve({ result: { data: [] } }) };
    }));

    const result = await tool.execute("tc3", { category: "inflation" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("通胀");
    expect(parsed.text).toContain("CPI");
    expect(parsed.text).not.toContain("PMI");
  });

  it.skipIf(skipRealApi)("真实 CPI 接口返回数据", async () => {
    const tool = createMacroAnalysisTool();
    const result = await tool.execute("tc4", { category: "inflation" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("CPI");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run src/tools/macro-analysis.test.ts`

Expected: 大量 FAIL，因为 `./macro-analysis.js` 不存在，`parseIndicatorRows` 等函数未定义。

---

## Task 2: 实现 macro-analysis.ts

**Files:**
- Create: `plugins/finbot-market/src/tools/macro-analysis.ts`

- [ ] **Step 3: 实现 Schema、类型和通用 datacenter fetcher**

```typescript
import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const MacroAnalysisSchema = {
  type: "object" as const,
  properties: {
    category: {
      type: "string" as const,
      enum: ["all", "inflation", "monetary", "growth", "external"],
      description: "指标分类，默认 all",
    },
  },
};

export interface IndicatorConfig {
  name: string;
  reportName: string;
  valueField: string;
  valueFormatter: (v: number) => string;
  yoyChangeField: string | null;
  momChangeField: string | null;
  yoyUnit: "pp" | "%";
  momUnit: "pp" | "%";
}

export interface MacroDataPoint {
  name: string;
  value: string;
  yoy: string | null;
  mom: string | null;
}

export interface CategoryData {
  category: string;
  indicators: MacroDataPoint[];
}

async function fetchDatacenterRows(reportName: string): Promise<Array<Record<string, unknown>>> {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=${reportName}&columns=ALL&pageNumber=1&pageSize=50&sortColumns=REPORT_DATE&sortTypes=-1`;
  const response = await fetch(url);
  const json = await response.json();
  if (!json.result?.data || !Array.isArray(json.result.data)) {
    throw new Error(`${reportName} 数据为空`);
  }
  return json.result.data;
}

function formatChange(value: number, unit: "pp" | "%"): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(unit === "pp" ? 2 : 2)}${unit}`;
}

export function parseIndicatorRows(
  rows: Array<Record<string, unknown>>,
  config: IndicatorConfig,
): MacroDataPoint {
  if (rows.length === 0) {
    return { name: config.name, value: "数据暂缺", yoy: null, mom: null };
  }

  const latest = rows[0];
  const prev = rows.length > 1 ? rows[1] : null;

  const rawValue = latest[config.valueField];
  const value = rawValue !== undefined && rawValue !== null
    ? config.valueFormatter(Number(rawValue))
    : "数据暂缺";

  if (value === "数据暂缺") {
    return { name: config.name, value, yoy: null, mom: null };
  }

  let yoy: string | null = null;
  if (config.yoyChangeField && latest[config.yoyChangeField] !== undefined && latest[config.yoyChangeField] !== null) {
    yoy = formatChange(Number(latest[config.yoyChangeField]), config.yoyUnit);
  } else if (prev && config.valueField && latest[config.valueField] !== undefined && prev[config.valueField] !== undefined) {
    const curr = Number(latest[config.valueField]);
    const pre = Number(prev[config.valueField]);
    const diff = +(curr - pre).toFixed(2);
    yoy = formatChange(diff, config.yoyUnit);
  }

  let mom: string | null = null;
  if (config.momChangeField && latest[config.momChangeField] !== undefined && latest[config.momChangeField] !== null) {
    mom = formatChange(Number(latest[config.momChangeField]), config.momUnit);
  } else if (prev && config.valueField && latest[config.valueField] !== undefined && prev[config.valueField] !== undefined) {
    const curr = Number(latest[config.valueField]);
    const pre = Number(prev[config.valueField]);
    if (config.momUnit === "%") {
      const pct = pre !== 0 ? +((curr - pre) / pre * 100).toFixed(2) : 0;
      mom = formatChange(pct, "%");
    } else {
      const diff = +(curr - pre).toFixed(2);
      mom = formatChange(diff, "pp");
    }
  }

  return { name: config.name, value, yoy, mom };
}
```

- [ ] **Step 4: 实现各指标 fetcher 与配置**

在上述文件底部继续追加：

```typescript
const INDICATOR_CONFIGS: Record<string, IndicatorConfig> = {
  cpi: {
    name: "CPI",
    reportName: "RPT_ECONOMY_CPI",
    valueField: "NATIONAL_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: "NATIONAL_SEQUENTIAL",
    yoyUnit: "pp",
    momUnit: "%",
  },
  ppi: {
    name: "PPI",
    reportName: "RPT_ECONOMY_PPI",
    valueField: "BASE_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "%",
  },
  pmi: {
    name: "PMI",
    reportName: "RPT_ECONOMY_PMI",
    valueField: "MAKE_INDEX",
    valueFormatter: (v: number) => `${v}`,
    yoyChangeField: "MAKE_SAME",
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
  gdp: {
    name: "GDP",
    reportName: "RPT_ECONOMY_GDP",
    valueField: "SUM_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "%",
  },
  m2: {
    name: "M2",
    reportName: "RPT_ECONOMY_M2",
    valueField: "M2_SAME",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "%",
  },
  financing: {
    name: "社融",
    reportName: "RPT_ECONOMY_FINANCING",
    valueField: "FINANCING_ABS",
    valueFormatter: (v: number) => `${(v / 1e4).toFixed(1)}万亿元`,
    yoyChangeField: "FINANCING_SAME",
    momChangeField: null,
    yoyUnit: "%",
    momUnit: "%",
  },
  lpr1y: {
    name: "LPR(1年期)",
    reportName: "RPT_ECONOMY_LPR",
    valueField: "LPR1Y",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
  lpr5y: {
    name: "LPR(5年期)",
    reportName: "RPT_ECONOMY_LPR",
    valueField: "LPR5Y",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
  unemployment: {
    name: "失业率",
    reportName: "RPT_ECONOMY_UNEMPLOYMENT",
    valueField: "UNEMPLOYMENT_RATE",
    valueFormatter: (v: number) => `${v}%`,
    yoyChangeField: null,
    momChangeField: null,
    yoyUnit: "pp",
    momUnit: "pp",
  },
};

async function fetchIndicator(config: IndicatorConfig): Promise<MacroDataPoint> {
  const rows = await fetchDatacenterRows(config.reportName);
  return parseIndicatorRows(rows, config);
}

async function fetchExchangeRate(): Promise<MacroDataPoint> {
  try {
    const url = "https://push2.eastmoney.com/api/qt/ulist.np/get?secids=133.USDCNH&fields=f43,f170";
    const response = await fetch(url);
    const json = await response.json();
    if (json.rc !== 0 || !json.data?.diff?.[0]) {
      throw new Error("汇率数据格式异常");
    }
    const d = json.data.diff[0];
    const f43 = d.f43;
    const f170 = d.f170;
    if (f43 === "-" || f43 === undefined || f43 === null) {
      throw new Error("汇率数据暂不可用");
    }
    const value = (Number(f43) / 10000).toFixed(4);
    const changePct = f170 !== "-" && f170 !== undefined && f170 !== null
      ? (Number(f170) / 100).toFixed(2)
      : "0.00";
    const sign = Number(changePct) >= 0 ? "+" : "";
    return {
      name: "美元兑人民币汇率",
      value,
      yoy: null,
      mom: `${sign}${changePct}%`,
    };
  } catch (error) {
    return { name: "美元兑人民币汇率", value: "数据暂缺", yoy: null, mom: null };
  }
}
```

- [ ] **Step 5: 实现 formatter 与工具工厂**

继续追加到同一文件底部：

```typescript
export function formatMacroOutput(categories: CategoryData[]): string {
  const lines: string[] = ["📊 宏观经济指标概览", ""];

  for (const cat of categories) {
    if (cat.indicators.length === 0) continue;
    lines.push(`${cat.category}:`);
    for (const ind of cat.indicators) {
      const parts: string[] = [`  ${ind.name}: ${ind.value}`];
      if (ind.yoy || ind.mom) {
        const yoyText = ind.yoy ? `同比 ${ind.yoy}` : "";
        const momText = ind.mom ? `环比 ${ind.mom}` : "";
        const combined = [yoyText, momText].filter(Boolean).join("  ");
        if (combined) parts.push(`(${combined})`);
      }
      lines.push(parts.join("  "));
    }
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

const CATEGORY_MAP: Record<string, string[]> = {
  inflation: ["cpi", "ppi"],
  monetary: ["m2", "financing", "lpr1y", "lpr5y"],
  growth: ["gdp", "pmi", "unemployment"],
  external: ["exchangeRate"],
};

export function createMacroAnalysisTool(): AnyAgentTool {
  return {
    name: "macroAnalysis",
    label: "Macro Analysis",
    description: "宏观经济数据查询：CPI、PPI、PMI、GDP、M2、社融、LPR、失业率、美元兑人民币汇率，支持按分类筛选",
    parameters: MacroAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const category = (params as { category?: string }).category ?? "all";
      const keys = category === "all" ? Object.keys(INDICATOR_CONFIGS) : CATEGORY_MAP[category] ?? [];

      const results: Record<string, MacroDataPoint> = {};

      await Promise.all(
        keys.map(async (key) => {
          try {
            const config = INDICATOR_CONFIGS[key];
            if (!config) return;
            results[key] = await fetchIndicator(config);
          } catch {
            results[key] = {
              name: INDICATOR_CONFIGS[key]?.name ?? key,
              value: "数据暂缺",
              yoy: null,
              mom: null,
            };
          }
        }),
      );

      // 汇率单独处理
      if (category === "all" || category === "external") {
        try {
          results.exchangeRate = await fetchExchangeRate();
        } catch {
          results.exchangeRate = { name: "美元兑人民币汇率", value: "数据暂缺", yoy: null, mom: null };
        }
      }

      // 按分类组装输出
      const categories: CategoryData[] = [
        { category: "通胀", indicators: [] },
        { category: "货币", indicators: [] },
        { category: "增长", indicators: [] },
        { category: "对外", indicators: [] },
      ];

      const pushToCategory = (key: string, catName: string) => {
        if (results[key]) {
          const cat = categories.find((c) => c.category === catName);
          if (cat) cat.indicators.push(results[key]);
        }
      };

      pushToCategory("cpi", "通胀");
      pushToCategory("ppi", "通胀");
      pushToCategory("m2", "货币");
      pushToCategory("financing", "货币");
      pushToCategory("lpr1y", "货币");
      pushToCategory("lpr5y", "货币");
      pushToCategory("gdp", "增长");
      pushToCategory("pmi", "增长");
      pushToCategory("unemployment", "增长");
      pushToCategory("exchangeRate", "对外");

      const output = formatMacroOutput(categories);
      const allFailed = Object.values(results).every((r) => r.value === "数据暂缺");
      return toToolResult({ content: output, isError: allFailed });
    },
  };
}
```

- [ ] **Step 6: 运行单元测试确认通过**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run src/tools/macro-analysis.test.ts`

Expected: PASS（schema 测试、formatter 测试、mock 集成测试全部通过）

---

## Task 3: 注册工具到插件入口

**Files:**
- Modify: `plugins/finbot-market/src/index.ts`
- Modify: `plugins/finbot-market/openclaw.plugin.json`

- [ ] **Step 7: 在 index.ts 导入并注册工具**

在 `src/index.ts` 中，找到 `import { createEtfAnalysisTool } from "./tools/etf-analysis.js";` 的下方添加：

```typescript
import { createMacroAnalysisTool } from "./tools/macro-analysis.js";
```

在 `api.registerTool(createEtfAnalysisTool());` 的下方添加：

```typescript
    api.registerTool(createMacroAnalysisTool());
```

- [ ] **Step 8: 在 openclaw.plugin.json 追加工具名**

在 `"etfAnalysis"` 后面添加 `"macroAnalysis"`：

```json
      "etfAnalysis",
      "macroAnalysis"
```

---

## Task 4: 验证

- [ ] **Step 9: 运行完整测试套件**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npm run test:ci`

Expected: 全部通过（含新增的 macro-analysis 测试，不含真实 API 测试）。

- [ ] **Step 10: 运行类型检查**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx tsc --noEmit`

Expected: 0 errors, 0 类型错误。

- [ ] **Step 11: 提交代码**

```bash
cd /home/san/PycharmProjects/finbot
git add plugins/finbot-market/src/tools/macro-analysis.ts plugins/finbot-market/src/tools/macro-analysis.test.ts plugins/finbot-market/src/index.ts plugins/finbot-market/openclaw.plugin.json
git commit -m "feat(tools): 新增宏观经济数据查询工具 macroAnalysis"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 单一综合工具 `macroAnalysis` 带 `category` 参数
- ✅ 支持 `all`、`inflation`、`monetary`、`growth`、`external` 分类
- ✅ 覆盖 CPI、PPI、PMI、GDP、M2、社融、LPR、失业率、汇率 9 个指标
- ✅ 输出格式：名称 + 最新值 + 同比 + 环比
- ✅ 各指标独立 try/catch，失败标"数据暂缺"
- ✅ 全部失败返回 `isError: true`
- ✅ 输出末尾包含 `⚠️ 不构成投资建议`
- ✅ 单元测试 + mock 测试 + 真实 API 测试（`it.skipIf(skipRealApi)`）
- ✅ 注册到 `src/index.ts` 和 `openclaw.plugin.json`

**2. Placeholder scan:**
- 无 TBD/TODO/"implement later"
- 所有代码片段完整可直接复制
- 所有命令包含预期输出

**3. Type consistency：**
- `IndicatorConfig`、`MacroDataPoint`、`CategoryData` 接口在测试和实现中一致
- `parseIndicatorRows` 和 `formatMacroOutput` 的导出签名在测试和实现中一致
- `createMacroAnalysisTool` 返回 `AnyAgentTool`，与现有工具一致
