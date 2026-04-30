# 舆情分析 + 大盘热力图工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `sentimentAnalysis`（舆情分析）和 `marketHeatmap`（大盘热力图）两个独立工具，支持新闻获取、简单情绪分类、行业涨跌幅与资金流向展示。

**Architecture:** 两个工具完全独立，各自遵循现有工具的代码组织模式（同文件内 schema + fetcher + formatter + factory）。sentimentAnalysis 对 symbol 走公告接口，对 keyword 走搜索接口，使用关键词匹配做简单情绪分类；marketHeatmap 单次请求 push2 行业列表接口获取涨跌幅与资金流向。

**Tech Stack:** TypeScript 5.9 / vitest / OpenClaw Plugin SDK / East Money API

---

## File Structure

| File | Responsibility |
|------|---------------|
| `plugins/finbot-market/src/tools/sentiment-analysis.ts` | Schema、新闻获取、情绪分类、格式化、工具工厂 |
| `plugins/finbot-market/src/tools/sentiment-analysis.test.ts` | 单元测试（情绪分类、格式化）、mock 集成测试 |
| `plugins/finbot-market/src/tools/market-heatmap.ts` | Schema、行业数据获取、格式化、工具工厂 |
| `plugins/finbot-market/src/tools/market-heatmap.test.ts` | 单元测试（格式化）、mock 集成测试 |
| `plugins/finbot-market/src/index.ts` | 注册 `createSentimentAnalysisTool()` 和 `createMarketHeatmapTool()` |
| `plugins/finbot-market/openclaw.plugin.json` | 追加 `sentimentAnalysis`、`marketHeatmap` 到 tools 列表 |

---

## Task 1: 编写 sentiment-analysis.test.ts（TDD 先写测试）

**Files:**
- Create: `plugins/finbot-market/src/tools/sentiment-analysis.test.ts`

- [ ] **Step 1: 编写情绪分类和格式化的单元测试**

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  createSentimentAnalysisTool,
  classifySentiment,
  formatSentimentOutput,
} from "./sentiment-analysis.js";

const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";

describe("classifySentiment", () => {
  it("正面关键词", () => {
    expect(classifySentiment("一季度营收同比增长15%")).toBe("正面");
    expect(classifySentiment("股价突破历史新高")).toBe("正面");
    expect(classifySentiment("机构大幅增持")).toBe("正面");
  });

  it("负面关键词", () => {
    expect(classifySentiment("净利润同比下滑20%")).toBe("负面");
    expect(classifySentiment("遭遇监管处罚")).toBe("负面");
    expect(classifySentiment("股价大幅下跌")).toBe("负面");
  });

  it("中性/无关键词", () => {
    expect(classifySentiment("公司发布例行公告")).toBe("中性");
    expect(classifySentiment("今日收盘情况")).toBe("中性");
  });
});

describe("formatSentimentOutput", () => {
  it("格式化完整输出", () => {
    const news = [
      { title: "营收增长", sentiment: "正面" as const, source: "财联社", date: "2026-04-30" },
      { title: "例行公告", sentiment: "中性" as const, source: "东方财富", date: "2026-04-29" },
      { title: "利润下滑", sentiment: "负面" as const, source: "证券时报", date: "2026-04-28" },
    ];
    const output = formatSentimentOutput("600519", "贵州茅台", news);
    expect(output).toContain("贵州茅台(600519) 舆情概览");
    expect(output).toContain("[正面]");
    expect(output).toContain("[中性]");
    expect(output).toContain("[负面]");
    expect(output).toContain("偏负面（正面1条 / 中性1条 / 负面1条）");
    expect(output).toContain("⚠️ 不构成投资建议");
  });

  it("无新闻时显示获取失败", () => {
    const output = formatSentimentOutput("600519", "贵州茅台", []);
    expect(output).toContain("未能获取到相关新闻");
  });

  it("仅 keyword 时显示关键词", () => {
    const news = [
      { title: "AI利好", sentiment: "正面" as const, source: "财联社", date: "2026-04-30" },
    ];
    const output = formatSentimentOutput(null, "人工智能", news);
    expect(output).toContain("人工智能 舆情概览");
  });
});

describe("sentimentAnalysis tool", () => {
  it("tool 元数据正确", () => {
    const tool = createSentimentAnalysisTool();
    expect(tool.name).toBe("sentimentAnalysis");
    expect(tool.parameters).toBeDefined();
  });
});

describe("sentimentAnalysis tool mock tests", () => {
  it("mock 测试 symbol 路径返回完整分析", async () => {
    const tool = createSentimentAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("np-anotice-stock.eastmoney.com")) {
        return {
          json: () => Promise.resolve({
            data: {
              list: [
                { title_ch: "一季度营收同比增长15.2%", notice_date: "2026-04-30 10:00", art_code: "123", codes: [{ short_name: "贵州茅台" }] },
                { title_ch: "茅台批价回升至2850元", notice_date: "2026-04-29 14:00", art_code: "124", codes: [{ short_name: "贵州茅台" }] },
                { title_ch: "某券商下调白酒行业评级", notice_date: "2026-04-28 09:00", art_code: "125", codes: [{ short_name: "贵州茅台" }] },
              ],
            },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc1", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("600519");
    expect(parsed.text).toContain("[正面]");
    expect(parsed.text).toContain("[负面]");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("mock 测试 keyword 路径", async () => {
    const tool = createSentimentAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("searchapi.eastmoney.com")) {
        return {
          json: () => Promise.resolve({
            QuotationCodeTable: {
              Data: [
                { Title: "人工智能产业迎来政策利好", Url: "https://finance.eastmoney.com/a/1.html", Art_Time: "2026-04-30" },
                { Title: "AI板块今日表现平淡", Url: "https://finance.eastmoney.com/a/2.html", Art_Time: "2026-04-29" },
              ],
            },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc2", { keyword: "人工智能" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("人工智能");
    expect(parsed.text).toContain("[正面]");
  });

  it("mock 测试新闻接口失败", async () => {
    const tool = createSentimentAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));

    const result = await tool.execute("tc3", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("未能获取");
  });

  it("参数校验：symbol 和 keyword 都为空", async () => {
    const tool = createSentimentAnalysisTool();
    const result = await tool.execute("tc4", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("至少提供");
  });

  it.skipIf(skipRealApi)("真实 symbol 接口返回数据", async () => {
    const tool = createSentimentAnalysisTool();
    const result = await tool.execute("tc5", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("600519");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run src/tools/sentiment-analysis.test.ts`

Expected: FAIL，因为 `./sentiment-analysis.js` 不存在，`classifySentiment` 等函数未定义。

---

## Task 2: 实现 sentiment-analysis.ts

**Files:**
- Create: `plugins/finbot-market/src/tools/sentiment-analysis.ts`

- [ ] **Step 3: 实现 Schema、类型和情绪分类**

```typescript
import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const SentimentAnalysisSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "股票/ETF 代码，如 600519.SH、510050",
    },
    keyword: {
      type: "string" as const,
      description: "主题关键词，如 人工智能、黄金",
    },
  },
};

interface NewsItem {
  title: string;
  sentiment: "正面" | "中性" | "负面";
  source: string;
  date: string;
}

const POSITIVE_KEYWORDS = [
  "增长", "上涨", "利好", "突破", "超预期", "盈利", "复苏", "强劲",
  "增持", "买入", "升", "新高", "改善", "扩张", "景气", "乐观",
];

const NEGATIVE_KEYWORDS = [
  "下跌", "下滑", "亏损", "下调", "减持", "卖出", "风险", "暴雷",
  "警示", "处罚", "负面", "降", "跌", "衰退", "萎缩", "悲观",
  "差评", "违约", "裁员", "暴亏",
];

export function classifySentiment(title: string): "正面" | "中性" | "负面" {
  const text = title.toLowerCase();
  let posScore = 0;
  let negScore = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) posScore++;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) negScore++;
  }

  if (posScore > negScore) return "正面";
  if (negScore > posScore) return "负面";
  return "中性";
}
```

- [ ] **Step 4: 实现新闻获取函数**

继续追加到同一文件底部：

```typescript
function extractStockCode(symbol: string): { code: string; marketId: string } | null {
  const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
  if (m) {
    const [, code, exchange] = m;
    return { code, marketId: exchange === "SH" ? "1" : "0" };
  }
  const bare = symbol.match(/^(\d{6})$/);
  if (bare) {
    return { code: bare[1], marketId: "1" };
  }
  return null;
}

async function fetchNewsBySymbol(symbol: string): Promise<NewsItem[]> {
  const info = extractStockCode(symbol);
  if (!info) {
    throw new Error("仅支持 A 股 6 位数字代码格式");
  }

  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?page_size=10&page_index=1&ann_type=A&stock_list=${info.code}&f_node=0&s_node=0`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const list: Array<{
    title_ch: string;
    notice_date: string;
    codes: Array<{ short_name: string }>;
  }> = json.data?.list ?? [];

  return list.slice(0, 8).map((item) => ({
    title: item.title_ch,
    sentiment: classifySentiment(item.title_ch),
    source: item.codes?.[0]?.short_name ?? "东方财富",
    date: item.notice_date?.split(" ")[0] ?? "",
  }));
}

async function fetchNewsByKeyword(keyword: string): Promise<NewsItem[]> {
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&count=10`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const list: Array<{
    Title: string;
    Url: string;
    Art_Time: string;
  }> = json.QuotationCodeTable?.Data ?? [];

  return list.slice(0, 8).map((item) => ({
    title: item.Title,
    sentiment: classifySentiment(item.Title),
    source: "东方财富",
    date: item.Art_Time?.split(" ")[0] ?? "",
  }));
}
```

- [ ] **Step 5: 实现格式化与工具工厂**

继续追加到同一文件底部：

```typescript
export function formatSentimentOutput(
  symbol: string | null,
  keyword: string | null,
  news: NewsItem[],
): string {
  const name = symbol && keyword
    ? `${keyword}(${symbol})`
    : symbol ?? keyword ?? "未知标的";

  if (news.length === 0) {
    return `📰 ${name} 舆情概览\n\n未能获取到相关新闻。\n\n⚠️ 不构成投资建议`;
  }

  const counts = { 正面: 0, 中性: 0, 负面: 0 };
  for (const n of news) counts[n.sentiment]++;

  let sentimentLabel = "中性";
  if (counts.正面 > counts.负面) sentimentLabel = "偏正面";
  if (counts.负面 > counts.正面) sentimentLabel = "偏负面";

  const lines: string[] = [
    `📰 ${name} 舆情概览`,
    "",
    "**最新动态**:",
  ];

  for (let i = 0; i < news.length; i++) {
    const n = news[i];
    lines.push(`  ${i + 1}. [${n.sentiment}] ${n.title}  (${n.source} ${n.date})`);
  }

  lines.push(
    "",
    `**情绪判断**: ${sentimentLabel}（正面${counts.正面}条 / 中性${counts.中性}条 / 负面${counts.负面}条）`,
    "",
    "⚠️ 不构成投资建议",
  );

  return lines.join("\n");
}

export function createSentimentAnalysisTool(): AnyAgentTool {
  return {
    name: "sentimentAnalysis",
    label: "Sentiment Analysis",
    description: "舆情分析：获取股票/主题的最新新闻并进行简单情绪判断。支持股票代码或关键词查询",
    parameters: SentimentAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, keyword } = params as {
        symbol?: string;
        keyword?: string;
      };

      if (!symbol && !keyword) {
        return toToolResult({
          content: "请至少提供 symbol（股票代码）或 keyword（关键词）之一",
          isError: true,
        });
      }

      try {
        let news: NewsItem[];
        if (symbol) {
          news = await fetchNewsBySymbol(symbol).catch(() => []);
        } else {
          news = await fetchNewsByKeyword(keyword!).catch(() => []);
        }

        if (news.length === 0) {
          return toToolResult({
            content: `未能获取到 ${symbol ?? keyword} 的相关新闻，请稍后重试`,
            isError: true,
          });
        }

        const output = formatSentimentOutput(symbol ?? null, keyword ?? null, news);
        return toToolResult({ content: output });
      } catch (error) {
        return toToolResult({
          content: `舆情分析失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
```

- [ ] **Step 6: 运行 sentiment 单元测试确认通过**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run src/tools/sentiment-analysis.test.ts`

Expected: PASS（情绪分类测试、formatter 测试、mock 集成测试全部通过）

---

## Task 3: 编写 market-heatmap.test.ts（TDD 先写测试）

**Files:**
- Create: `plugins/finbot-market/src/tools/market-heatmap.test.ts`

- [ ] **Step 7: 编写格式化与工具 mock 测试**

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  createMarketHeatmapTool,
  formatHeatmapOutput,
} from "./market-heatmap.js";

const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";

describe("formatHeatmapOutput", () => {
  it("格式化完整输出", () => {
    const sectors = [
      { name: "计算机", changePercent: 3.45, netInflow: 4520000000 },
      { name: "电子", changePercent: 2.89, netInflow: 3870000000 },
      { name: "通信", changePercent: 2.12, netInflow: 2210000000 },
      { name: "煤炭", changePercent: -2.15, netInflow: -1830000000 },
      { name: "银行", changePercent: -1.02, netInflow: -1250000000 },
    ];
    const output = formatHeatmapOutput("A股", sectors);
    expect(output).toContain("A股 行业热力图");
    expect(output).toContain("领涨行业");
    expect(output).toContain("计算机 +3.45%");
    expect(output).toContain("主力净流入 +45.2亿");
    expect(output).toContain("领跌行业");
    expect(output).toContain("煤炭 -2.15%");
    expect(output).toContain("主力净流出 -18.3亿");
    expect(output).toContain("⚠️ 不构成投资建议");
  });

  it("空数据时显示数据暂缺", () => {
    const output = formatHeatmapOutput("A股", []);
    expect(output).toContain("未能获取到行业数据");
  });

  it("仅上涨行业", () => {
    const sectors = [
      { name: "计算机", changePercent: 1.5, netInflow: 1000000000 },
    ];
    const output = formatHeatmapOutput("A股", sectors);
    expect(output).toContain("领涨行业");
    expect(output).not.toContain("领跌行业");
  });
});

describe("marketHeatmap tool", () => {
  it("tool 元数据正确", () => {
    const tool = createMarketHeatmapTool();
    expect(tool.name).toBe("marketHeatmap");
    expect(tool.parameters).toBeDefined();
  });
});

describe("marketHeatmap tool mock tests", () => {
  it("mock 测试返回完整热力图", async () => {
    const tool = createMarketHeatmapTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("push2.eastmoney.com") && url.includes("fs=m:90+t:2")) {
        return {
          json: () => Promise.resolve({
            data: {
              diff: [
                { f14: "计算机", f3: 345, f62: 4520000000 },
                { f14: "电子", f3: 289, f62: 3870000000 },
                { f14: "通信", f3: 212, f62: 2210000000 },
                { f14: "煤炭", f3: -215, f62: -1830000000 },
                { f14: "银行", f3: -102, f62: -1250000000 },
              ],
            },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc1", { market: "A股" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("A股 行业热力图");
    expect(parsed.text).toContain("计算机");
    expect(parsed.text).toContain("银行");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("mock 测试部分数据缺失", async () => {
    const tool = createMarketHeatmapTool();

    vi.stubGlobal("fetch", vi.fn(async () => {
      return {
        json: () => Promise.resolve({
          data: {
            diff: [
              { f14: "计算机", f3: 345, f62: 4520000000 },
              { f14: "电子", f3: null, f62: null },
            ],
          },
        }),
      };
    }));

    const result = await tool.execute("tc2", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("计算机");
  });

  it("mock 测试接口完全失败", async () => {
    const tool = createMarketHeatmapTool();

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));

    const result = await tool.execute("tc3", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("获取失败");
  });

  it.skipIf(skipRealApi)("真实 A股行业接口返回数据", async () => {
    const tool = createMarketHeatmapTool();
    const result = await tool.execute("tc4", { market: "A股" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("行业热力图");
  });
});
```

- [ ] **Step 8: 运行测试确认失败**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run src/tools/market-heatmap.test.ts`

Expected: FAIL，因为 `./market-heatmap.js` 不存在。

---

## Task 4: 实现 market-heatmap.ts

**Files:**
- Create: `plugins/finbot-market/src/tools/market-heatmap.ts`

- [ ] **Step 9: 实现 Schema、数据获取和格式化**

```typescript
import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const MarketHeatmapSchema = {
  type: "object" as const,
  properties: {
    market: {
      type: "string" as const,
      enum: ["A股", "港股"],
      description: "市场，默认 A股",
    },
  },
};

interface SectorData {
  name: string;
  changePercent: number;
  netInflow: number; // 主力净流入，单位元
}

function formatBillionYuan(yuan: number): string {
  const billion = yuan / 1e8;
  const sign = billion >= 0 ? "+" : "";
  return `${sign}${billion.toFixed(1)}亿`;
}

function getSectorFieldSet(market: string): string {
  if (market === "港股") {
    return "m:128+t:3"; // 港股行业，最佳 effort
  }
  return "m:90+t:2"; // A股申万行业
}

async function fetchSectorData(market: string): Promise<SectorData[]> {
  const fs = getSectorFieldSet(market);
  const fields = "f12,f14,f3,f62";
  const url = `https://push2.eastmoney.com/api/qt/clist/get?fs=${fs}&fields=${fields}&_=${Date.now()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const diff: Array<{
    f14: string;
    f3: number | null;
    f62: number | null;
  }> = json.data?.diff ?? [];

  if (!Array.isArray(diff) || diff.length === 0) {
    throw new Error("行业数据为空");
  }

  return diff
    .filter((d) => d.f14 && d.f3 !== null && d.f3 !== undefined)
    .map((d) => ({
      name: String(d.f14),
      changePercent: Number(d.f3) / 100,
      netInflow: Number(d.f62 ?? 0),
    }));
}

export function formatHeatmapOutput(
  market: string,
  sectors: SectorData[],
): string {
  if (sectors.length === 0) {
    return `📊 ${market} 行业热力图\n\n未能获取到行业数据。\n\n⚠️ 不构成投资建议`;
  }

  const sorted = [...sectors].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter((s) => s.changePercent > 0);
  const losers = sorted.filter((s) => s.changePercent < 0);
  const dateStr = new Date().toLocaleDateString("zh-CN");

  const lines: string[] = [
    `📊 ${market} 行业热力图（${dateStr}）`,
    "",
  ];

  if (gainers.length > 0) {
    lines.push("**领涨行业**:");
    for (const s of gainers.slice(0, 5)) {
      const inflowText = s.netInflow >= 0
        ? `主力净流入 +${formatBillionYuan(s.netInflow).slice(1)}`
        : `主力净流出 ${formatBillionYuan(s.netInflow)}`;
      lines.push(`  ${s.name} +${s.changePercent.toFixed(2)}%  ${inflowText}`);
    }
    lines.push("");
  }

  if (losers.length > 0) {
    lines.push("**领跌行业**:");
    for (const s of losers.slice(-5).reverse()) {
      const inflowText = s.netInflow >= 0
        ? `主力净流入 +${formatBillionYuan(s.netInflow).slice(1)}`
        : `主力净流出 ${formatBillionYuan(s.netInflow)}`;
      lines.push(`  ${s.name} ${s.changePercent.toFixed(2)}%  ${inflowText}`);
    }
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export function createMarketHeatmapTool(): AnyAgentTool {
  return {
    name: "marketHeatmap",
    label: "Market Heatmap",
    description: "大盘热力图：展示 A股/港股 各行业涨跌幅及主力资金流向",
    parameters: MarketHeatmapSchema,
    execute: async (_toolCallId, params) => {
      const market = (params as { market?: string }).market ?? "A股";

      try {
        const sectors = await fetchSectorData(market).catch(() => []);

        if (sectors.length === 0) {
          return toToolResult({
            content: `${market} 行业数据获取失败，请稍后重试`,
            isError: true,
          });
        }

        const output = formatHeatmapOutput(market, sectors);
        return toToolResult({ content: output });
      } catch (error) {
        return toToolResult({
          content: `热力图获取失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
```

- [ ] **Step 10: 运行 heatmap 单元测试确认通过**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run src/tools/market-heatmap.test.ts`

Expected: PASS（formatter 测试、mock 集成测试全部通过）

---

## Task 5: 注册工具到插件入口

**Files:**
- Modify: `plugins/finbot-market/src/index.ts`
- Modify: `plugins/finbot-market/openclaw.plugin.json`

- [ ] **Step 11: 在 index.ts 导入并注册两个工具**

在 `src/index.ts` 中，找到 `import { createMacroAnalysisTool } from "./tools/macro-analysis.js";` 的下方添加：

```typescript
import { createSentimentAnalysisTool } from "./tools/sentiment-analysis.js";
import { createMarketHeatmapTool } from "./tools/market-heatmap.js";
```

在 `api.registerTool(createMacroAnalysisTool());` 的下方添加：

```typescript
    api.registerTool(createSentimentAnalysisTool());
    api.registerTool(createMarketHeatmapTool());
```

- [ ] **Step 12: 在 openclaw.plugin.json 追加工具名**

在 `"macroAnalysis"` 后面添加 `"sentimentAnalysis"` 和 `"marketHeatmap"`：

```json
      "macroAnalysis",
      "sentimentAnalysis",
      "marketHeatmap"
```

---

## Task 6: 验证

- [ ] **Step 13: 运行完整测试套件**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npm run test:ci`

Expected: 全部通过（含新增的 sentiment-analysis 和 market-heatmap 测试，不含真实 API 测试）。

- [ ] **Step 14: 运行类型检查**

Run: `cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx tsc --noEmit`

Expected: 0 errors, 0 类型错误。

- [ ] **Step 15: 提交代码**

```bash
cd /home/san/PycharmProjects/finbot
git add plugins/finbot-market/src/tools/sentiment-analysis.ts plugins/finbot-market/src/tools/sentiment-analysis.test.ts plugins/finbot-market/src/tools/market-heatmap.ts plugins/finbot-market/src/tools/market-heatmap.test.ts plugins/finbot-market/src/index.ts plugins/finbot-market/openclaw.plugin.json
git commit -m "feat(tools): 新增舆情分析和大盘热力图工具"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ `sentimentAnalysis`：支持 `symbol` 和 `keyword`，至少填一个
- ✅ `marketHeatmap`：支持 `market` 参数，默认 A股
- ✅ 情绪分类：正面/中性/负面，基于关键词启发式规则
- ✅ 输出格式：新闻列表带情绪标签 + 情绪统计
- ✅ 热力图输出：领涨行业 + 领跌行业 + 涨跌幅 + 资金流向
- ✅ 错误处理：接口失败标"获取失败"，全部失败返回 `isError: true`
- ✅ 输出末尾包含 `⚠️ 不构成投资建议`
- ✅ 单元测试 + mock 测试 + 真实 API 测试（`it.skipIf(skipRealApi)`）
- ✅ 注册到 `src/index.ts` 和 `openclaw.plugin.json`

**2. Placeholder scan:**
- 无 TBD/TODO/"implement later"
- 所有代码片段完整可直接复制
- 所有命令包含预期输出

**3. Type consistency：**
- `NewsItem`、`SectorData` 接口在测试和实现中一致
- `classifySentiment`、`formatSentimentOutput`、`formatHeatmapOutput` 导出签名一致
- `createSentimentAnalysisTool`、`createMarketHeatmapTool` 返回 `AnyAgentTool`
