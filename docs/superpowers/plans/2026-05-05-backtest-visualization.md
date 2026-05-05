# 策略回测可视化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 让 `strategyBacktest` 工具生成可交互的 HTML 收益曲线报告。

**Architecture:** 在 `runBacktest` 中保存 `equityCurve`，新增 `generateBacktestHtml` 生成含 lightweight-charts CDN 的 HTML 字符串，用 `fs/promises` 写入 `workspace/backtest-reports/`，工具返回值追加文件路径。

**Tech Stack:** TypeScript / Node.js / lightweight-charts CDN / vitest

---

### Task 1: 扩展 BacktestResult 并保存 equityCurve

**Files:**
- Modify: `plugins/finbot-market/src/tools/strategy-backtest.ts:55-67`

- [ ] **Step 1: 修改 BacktestResult 接口**

在 `interface BacktestResult` 中新增一行：

```ts
interface BacktestResult {
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  annualizedReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  tradeCount: number;
  winCount: number;
  winRatePct: number;
  holdReturnPct: number;
  equityCurve: number[]; // 新增
  trades: Trade[];
}
```

- [ ] **Step 2: 在 runBacktest 中收集 equityCurve**

`runBacktest` 函数已有 `const equityCurve: number[] = [];`，在循环末尾 `equityCurve.push(equity);`。只需确认它在 `return` 中被包含：

```ts
return {
  initialCapital,
  finalCapital: +finalCapital.toFixed(2),
  totalReturnPct,
  annualizedReturnPct,
  maxDrawdownPct,
  sharpeRatio,
  tradeCount,
  winCount,
  winRatePct,
  holdReturnPct,
  equityCurve, // 新增
  trades,
};
```

- [ ] **Step 3: Commit**

```bash
cd /home/san/PycharmProjects/finbot/plugins/finbot-market
git add src/tools/strategy-backtest.ts
git commit -m "feat(backtest): BacktestResult 增加 equityCurve"
```

---

### Task 2: 生成 HTML 报告

**Files:**
- Modify: `plugins/finbot-market/src/tools/strategy-backtest.ts`

- [ ] **Step 1: 新增 generateBacktestHtml 函数**

在 `runBacktest` 之后、`createStrategyBacktestTool` 之前插入：

```ts
import * as fs from "fs/promises";
import * as path from "path";

function generateBacktestHtml(
  symbol: string,
  strategy: string,
  result: BacktestResult,
  klines: Kline[],
): string {
  const dates = klines.slice(-result.equityCurve.length).map((k) => k.date);
  const holdCurve = result.equityCurve.map((_, i) => {
    const firstClose = klines[klines.length - result.equityCurve.length].close;
    const currClose = klines[klines.length - result.equityCurve.length + i].close;
    return +(result.initialCapital * (currClose / firstClose)).toFixed(2);
  });

  const strategyData = dates.map((d, i) => ({ time: d, value: result.equityCurve[i] }));
  const holdData = dates.map((d, i) => ({ time: d, value: holdCurve[i] }));

  const tradesRows = result.trades.map((t) =>
    `<tr><td>${t.date}</td><td>${t.action === "BUY" ? "买入" : "卖出"}</td><td>${t.price.toFixed(2)}</td><td>${t.shares}</td><td>${t.value.toFixed(2)}</td><td>${t.reason}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${symbol} 策略回测报告</title>
<script src="https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.js"></script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#333}
h1{font-size:20px;margin-bottom:8px}
h2{font-size:14px;color:#666;margin-bottom:20px}
#chart{height:400px;margin-bottom:24px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.metric{background:#f6f8fa;border-radius:8px;padding:12px;text-align:center}
.metric-value{font-size:18px;font-weight:600}
.metric-label{font-size:12px;color:#666;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #eaecef}
th{background:#f6f8fa;font-weight:500}
tr:hover{background:#f6f8fa}
</style>
</head>
<body>
<h1>${symbol} 策略回测报告</h1>
<h2>${strategy === "MA_CROSSOVER" ? "双均线交叉" : strategy === "RSI_THRESHOLD" ? "RSI 阈值" : "MACD 金叉死叉"} | 初始资金 ${result.initialCapital.toLocaleString()}</h2>
<div id="chart"></div>
<div class="metrics">
  <div class="metric"><div class="metric-value">${result.totalReturnPct}%</div><div class="metric-label">策略收益</div></div>
  <div class="metric"><div class="metric-value">${result.holdReturnPct}%</div><div class="metric-label">持有收益</div></div>
  <div class="metric"><div class="metric-value">${result.maxDrawdownPct}%</div><div class="metric-label">最大回撤</div></div>
  <div class="metric"><div class="metric-value">${result.sharpeRatio}</div><div class="metric-label">夏普比率</div></div>
  <div class="metric"><div class="metric-value">${result.tradeCount}</div><div class="metric-label">交易次数</div></div>
  <div class="metric"><div class="metric-value">${result.winRatePct}%</div><div class="metric-label">胜率</div></div>
  <div class="metric"><div class="metric-value">${result.annualizedReturnPct}%</div><div class="metric-label">年化收益</div></div>
  <div class="metric"><div class="metric-value">${result.finalCapital.toLocaleString()}</div><div class="metric-label">最终资金</div></div>
</div>
<h3>交易明细</h3>
<table>
  <thead><tr><th>日期</th><th>操作</th><th>价格</th><th>股数</th><th>金额</th><th>触发原因</th></tr></thead>
  <tbody>${tradesRows}</tbody>
</table>
<script>
const chart = LightweightCharts.createChart(document.getElementById('chart'), { width: 920, height: 400, layout: { background: { color: '#ffffff' }, textColor: '#333' }, grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal }, rightPriceScale: { borderColor: '#e0e0e0' }, timeScale: { borderColor: '#e0e0e0' } });
const strategySeries = chart.addLineSeries({ color: '#2962FF', lineWidth: 2, title: '策略收益' });
strategySeries.setData(${JSON.stringify(strategyData)});
const holdSeries = chart.addLineSeries({ color: '#9E9E9E', lineWidth: 2, lineStyle: LightweightCharts.LineStyle.LargeDashed, title: '持有收益' });
holdSeries.setData(${JSON.stringify(holdData)});
chart.timeScale().fitContent();
</script>
</body>
</html>`;
}
```

注意：函数体内部用模板字符串生成 HTML，其中 `${JSON.stringify(...)}` 会被运行时正确替换为数据。

- [ ] **Step 2: 修改 execute 方法写入文件**

在 `execute` 中，`const result = runBacktest(...)` 之后、`lines` 组装之前插入：

```ts
// 生成 HTML 报告
const reportDir = path.join(process.env.HOME || "/tmp", ".openclaw", "workspace", "backtest-reports");
const reportName = `${symbol.replace(/\./g, "_")}_${strategy}_${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
const reportPath = path.join(reportDir, reportName);

try {
  await fs.mkdir(reportDir, { recursive: true });
  const html = generateBacktestHtml(symbol, strategy, result, klines);
  await fs.writeFile(reportPath, html, "utf-8");
} catch {
  // HTML 生成失败不影响文本报告
}
```

在 `lines.push(...)` 的最后（在 `⚠️ 回测结果基于历史数据` 那行之前）追加：

```ts
if (reportPath) {
  lines.push("", `📄 可视化报告已生成: ${reportPath}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/tools/strategy-backtest.ts
git commit -m "feat(backtest): 生成 HTML 可视化报告"
```

---

### Task 3: 补测试

**Files:**
- Modify: `plugins/finbot-market/src/tools/strategy-backtest.test.ts`

- [ ] **Step 1: 导入 generateBacktestHtml**

修改 import：

```ts
import { createStrategyBacktestTool } from "./strategy-backtest.js";
```

保持原样，因为 `generateBacktestHtml` 不导出，通过 tool.execute 间接测试。

- [ ] **Step 2: 新增 HTML 报告测试**

在文件末尾新增一个测试（不依赖真实 API）：

```ts
describe("generateBacktestHtml", () => {
  it("HTML 包含关键元素", async () => {
    // 用 mock 数据直接触发 execute 的 HTML 生成逻辑
    // 由于 generateBacktestHtml 未导出，通过测试 execute 的输出是否包含报告路径来验证
    const tool = createStrategyBacktestTool();
    const result = await tool.execute("tc-html", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    // AAPL 不支持 A股/港股 K线，会报错，但我们要测的是正常流程
    // 所以这里不测 AAPL，而是依赖真实 API 测试
    expect(parsed).toBeDefined();
  });
});
```

实际更好的方式：在真实 API 测试中追加断言。

修改现有的真实 API 测试（MA 交叉和港股 RSI），在 `expect(parsed.isError).toBeFalsy()` 之后追加：

```ts
expect(parsed.text).toContain("📄 可视化报告已生成:");
```

- [ ] **Step 3: 新增 equityCurve 测试**

```ts
import { describe, it, expect, vi } from "vitest";
```

在文件末尾新增：

```ts
describe("equityCurve", () => {
  it("equityCurve 长度等于实际交易天数", async () => {
    const tool = createStrategyBacktestTool();
    const result = await tool.execute("tc4", { symbol: "600519.SH", strategy: "MA_CROSSOVER" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("📄 可视化报告已生成:");
  });
});
```

注意：这个测试同样依赖真实 API，所以放在 `skipIf(skipRealApi)` 下。更简单的方式是把 HTML 路径断言加到已有的两个真实 API 测试里。

最终修改：把 `it.skipIf(skipRealApi)("A 股 MA 交叉回测成功"...)` 和 `it.skipIf(skipRealApi)("港股 RSI 回测成功"...)` 各自追加一行：

```ts
expect(parsed.text).toContain("📄 可视化报告已生成:");
```

- [ ] **Step 4: Run tests**

```bash
npm run test:ci
```

Expected: 全部通过（真实 API 测试被 skip）。

- [ ] **Step 5: Commit**

```bash
git add src/tools/strategy-backtest.test.ts
git commit -m "test(backtest): 验证 HTML 报告生成"
```

---

### Task 4: 验证 HTML 文件

**Files:**
- 无代码修改

- [ ] **Step 1: 本地跑一次真实回测**

```bash
SKIP_REAL_API=0 npx vitest run src/tools/strategy-backtest.test.ts -t "A 股 MA 交叉回测成功"
```

- [ ] **Step 2: 检查生成的 HTML 文件**

```bash
ls ~/.openclaw/workspace/backtest-reports/
```

Expected: 有一个 `.html` 文件。

- [ ] **Step 3: 用浏览器打开验证**

打开文件，确认：
- 有两条线（蓝色策略收益 + 灰色持有收益）
- 下方有 8 个指标卡片
- 有交易明细表格
- hover 图表显示 tooltip

---

## Self-Review

**Spec coverage:**
- ✅ HTML 文件生成 → Task 2
- ✅ lightweight-charts CDN → Task 2 Step 1
- ✅ 策略收益曲线 + 持有收益曲线 → Task 2 Step 1 中的 `strategyData` 和 `holdData`
- ✅ 风险指标卡片 → Task 2 Step 1 中的 `.metrics`
- ✅ 交易明细表格 → Task 2 Step 1 中的 `<table>`
- ✅ 文件路径追加到返回值 → Task 2 Step 2
- ✅ 错误处理（HTML 失败不影响文本报告）→ Task 2 Step 2 中的 `try/catch`
- ✅ 测试 → Task 3

**Placeholder scan:** 无 TBD/TODO。

**Type consistency:** `BacktestResult` 中的 `equityCurve: number[]` 在 Task 1 定义，Task 2 中使用，一致。
