import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import { calcMA, calcRSI, calcMACD, fetchKlines, type Kline } from "./technical-analysis.js";
import * as fs from "fs/promises";
import * as path from "path";

const StrategyBacktestSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "标的代码，如 600519.SH、00700.HK",
    },
    strategy: {
      type: "string" as const,
      enum: ["MA_CROSSOVER", "RSI_THRESHOLD", "MACD"],
      description: "回测策略类型（默认 MA_CROSSOVER）",
    },
    initialCapital: {
      type: "number" as const,
      description: "初始资金（默认 100000）",
    },
    period: {
      type: "string" as const,
      enum: ["daily", "weekly"],
      description: "K 线周期（默认 daily）",
    },
    shortPeriod: {
      type: "number" as const,
      description: "MA 短期周期（默认 5，仅 MA_CROSSOVER 有效）",
    },
    longPeriod: {
      type: "number" as const,
      description: "MA 长期周期（默认 20，仅 MA_CROSSOVER 有效）",
    },
    rsiBuy: {
      type: "number" as const,
      description: "RSI 买入阈值（默认 30，仅 RSI_THRESHOLD 有效）",
    },
    rsiSell: {
      type: "number" as const,
      description: "RSI 卖出阈值（默认 70，仅 RSI_THRESHOLD 有效）",
    },
  },
  required: ["symbol"],
};

interface Trade {
  date: string;
  action: "BUY" | "SELL";
  price: number;
  shares: number;
  value: number;
  reason: string;
}

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
  equityCurve: number[];
  trades: Trade[];
}

function calcMaxDrawdown(equity: number[]): number {
  let maxDrawdown = 0;
  let peak = equity[0];
  for (const val of equity) {
    if (val > peak) peak = val;
    const drawdown = (peak - val) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

function calcSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / dailyReturns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return mean / std * Math.sqrt(252);
}

function runBacktest(
  klines: Kline[],
  strategy: string,
  initialCapital: number,
  shortPeriod: number,
  longPeriod: number,
  rsiBuy: number,
  rsiSell: number
): BacktestResult {
  const closes = klines.map((k) => k.close);
  let cash = initialCapital;
  let shares = 0;
  let position = false;
  const trades: Trade[] = [];
  const equityCurve: number[] = [];
  const dailyReturns: number[] = [];

  const warmup = strategy === "MA_CROSSOVER" ? longPeriod : strategy === "RSI_THRESHOLD" ? 15 : 35;

  for (let i = warmup; i < klines.length; i++) {
    const price = klines[i].close;
    const prevPrice = i > 0 ? klines[i - 1].close : price;
    const slice = closes.slice(0, i + 1);

    let signal: "BUY" | "SELL" | null = null;
    let reason = "";

    if (strategy === "MA_CROSSOVER") {
      const currMA = calcMA(slice, [shortPeriod, longPeriod]);
      const prevMA = calcMA(closes.slice(0, i), [shortPeriod, longPeriod]);
      const sCurr = currMA.get(shortPeriod);
      const lCurr = currMA.get(longPeriod);
      const sPrev = prevMA.get(shortPeriod);
      const lPrev = prevMA.get(longPeriod);
      if (sCurr && lCurr && sPrev && lPrev) {
        if (!position && sCurr > lCurr && sPrev <= lPrev) {
          signal = "BUY";
          reason = `MA${shortPeriod} 上穿 MA${longPeriod}`;
        } else if (position && sCurr < lCurr && sPrev >= lPrev) {
          signal = "SELL";
          reason = `MA${shortPeriod} 下穿 MA${longPeriod}`;
        }
      }
    } else if (strategy === "RSI_THRESHOLD") {
      const currRSI = calcRSI(slice, 14);
      const prevRSI = calcRSI(closes.slice(0, i), 14);
      if (currRSI !== null && prevRSI !== null) {
        if (!position && currRSI < rsiBuy && prevRSI >= rsiBuy) {
          signal = "BUY";
          reason = `RSI(14) 跌入超卖区 (${currRSI.toFixed(2)})`;
        } else if (position && currRSI > rsiSell && prevRSI <= rsiSell) {
          signal = "SELL";
          reason = `RSI(14) 涨入超买区 (${currRSI.toFixed(2)})`;
        }
      }
    } else if (strategy === "MACD") {
      const currMACD = calcMACD(slice);
      const prevMACD = calcMACD(closes.slice(0, i));
      if (currMACD && prevMACD) {
        if (!position && currMACD.macd > 0 && prevMACD.macd <= 0) {
          signal = "BUY";
          reason = "MACD 金叉（柱线转正）";
        } else if (position && currMACD.macd < 0 && prevMACD.macd >= 0) {
          signal = "SELL";
          reason = "MACD 死叉（柱线转负）";
        }
      }
    }

    if (signal === "BUY" && cash > 0) {
      const buyShares = Math.floor(cash / price);
      if (buyShares > 0) {
        const value = buyShares * price;
        cash -= value;
        shares = buyShares;
        position = true;
        trades.push({ date: klines[i].date, action: "BUY", price, shares, value, reason });
      }
    } else if (signal === "SELL" && shares > 0) {
      const value = shares * price;
      cash += value;
      trades.push({ date: klines[i].date, action: "SELL", price, shares, value, reason });
      shares = 0;
      position = false;
    }

    const equity = cash + shares * price;
    equityCurve.push(equity);
    if (equityCurve.length > 1) {
      dailyReturns.push((equity - equityCurve[equityCurve.length - 2]) / equityCurve[equityCurve.length - 2]);
    }
  }

  const finalPrice = closes[closes.length - 1];
  const finalCapital = cash + shares * finalPrice;
  const totalReturnPct = +((finalCapital - initialCapital) / initialCapital * 100).toFixed(2);
  const holdReturnPct = +((finalPrice - closes[warmup]) / closes[warmup] * 100).toFixed(2);

  const years = klines.length / 252;
  const annualizedReturnPct = years > 0 ? +(((finalCapital / initialCapital) ** (1 / years) - 1) * 100).toFixed(2) : 0;
  const maxDrawdownPct = +(calcMaxDrawdown(equityCurve) * 100).toFixed(2);
  const sharpeRatio = +calcSharpe(dailyReturns).toFixed(2);

  let winCount = 0;
  for (let i = 1; i < trades.length; i += 2) {
    if (trades[i].price > trades[i - 1].price) winCount++;
  }
  const tradeCount = Math.floor(trades.length / 2);
  const winRatePct = tradeCount > 0 ? +((winCount / tradeCount) * 100).toFixed(2) : 0;

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
    equityCurve,
    trades,
  };
}

function generateBacktestHtml(
  symbol: string,
  strategy: string,
  result: BacktestResult,
  klines: Kline[],
): string {
  const dates = klines.slice(-result.equityCurve.length).map((k) => k.date);
  const startIndex = klines.length - result.equityCurve.length;
  const firstClose = klines[startIndex].close;
  const holdCurve = result.equityCurve.map((_, i) => {
    const currClose = klines[startIndex + i].close;
    return +(result.initialCapital * (currClose / firstClose)).toFixed(2);
  });

  const strategyData = dates.map((d, i) => ({ time: d, value: result.equityCurve[i] }));
  const holdData = dates.map((d, i) => ({ time: d, value: holdCurve[i] }));

  const tradesRows = result.trades
    .map(
      (t) =>
        `<tr><td>${t.date}</td><td>${t.action === "BUY" ? "买入" : "卖出"}</td><td>${t.price.toFixed(2)}</td><td>${t.shares}</td><td>${t.value.toFixed(2)}</td><td>${t.reason}</td></tr>`,
    )
    .join("");

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

export function createStrategyBacktestTool(): AnyAgentTool {
  return {
    name: "strategyBacktest",
    label: "Strategy Backtest",
    description: "基于历史 K 线的策略回测，支持双均线交叉、RSI 阈值、MACD 策略",
    parameters: StrategyBacktestSchema,
    execute: async (_toolCallId, params) => {
      const {
        symbol,
        strategy = "MA_CROSSOVER",
        initialCapital = 100000,
        period = "daily",
        shortPeriod = 5,
        longPeriod = 20,
        rsiBuy = 30,
        rsiSell = 70,
      } = params as {
        symbol: string;
        strategy?: string;
        initialCapital?: number;
        period?: string;
        shortPeriod?: number;
        longPeriod?: number;
        rsiBuy?: number;
        rsiSell?: number;
      };

      try {
        const klt = period === "weekly" ? "102" : "101";
        const klines = await fetchKlines(symbol, 500, klt);
        if (klines.length < 60) {
          return toToolResult({ content: "历史数据不足，无法进行回测", isError: true });
        }

        const result = runBacktest(klines, strategy, initialCapital, shortPeriod, longPeriod, rsiBuy, rsiSell);

        // 生成 HTML 报告
        const reportDir = path.join(process.env.HOME || "/tmp", ".openclaw", "workspace", "backtest-reports");
        const reportName = `${symbol.replace(/\./g, "_")}_${strategy}_${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
        const reportPath = path.join(reportDir, reportName);

        try {
          await fs.mkdir(reportDir, { recursive: true });
          const html = generateBacktestHtml(symbol, strategy, result, klines);
          await fs.writeFile(reportPath, html, "utf-8");
        } catch {
          // HTML 生成失败不影响文本报告返回
        }

        const lines: string[] = [
          `📈 ${symbol} 策略回测报告`,
          `策略: ${strategy === "MA_CROSSOVER" ? `双均线交叉 (MA${shortPeriod}/MA${longPeriod})` : strategy === "RSI_THRESHOLD" ? `RSI 阈值 (${rsiBuy}/${rsiSell})` : "MACD 金叉死叉"}`,
          `周期: ${period === "weekly" ? "周线" : "日线"} ｜ 数据长度: ${klines.length} 根 K 线 (${klines[0].date} ~ ${klines[klines.length - 1].date})`,
          "",
          "**收益表现**:",
          `  初始资金: ${result.initialCapital.toLocaleString()}`,
          `  最终资金: ${result.finalCapital.toLocaleString()}`,
          `  策略收益: ${result.totalReturnPct}%`,
          `  年化收益: ${result.annualizedReturnPct}%`,
          `  同期持有收益: ${result.holdReturnPct}%`,
          `  超额收益: ${+(result.totalReturnPct - result.holdReturnPct).toFixed(2)}%`,
          "",
          "**风险指标**:",
          `  最大回撤: ${result.maxDrawdownPct}%`,
          `  夏普比率: ${result.sharpeRatio}`,
          "",
          "**交易统计**:",
          `  完整交易次数: ${result.tradeCount} 次`,
          `  盈利次数: ${result.winCount} 次`,
          `  胜率: ${result.winRatePct}%`,
        ];

        if (result.trades.length > 0) {
          lines.push("", "**交易明细**:", "| 日期 | 操作 | 价格 | 股数 | 金额 | 触发原因 |", "|------|------|------|------|------|----------|");
          for (const t of result.trades) {
            lines.push(`| ${t.date} | ${t.action === "BUY" ? "买入" : "卖出"} | ${t.price.toFixed(2)} | ${t.shares} | ${t.value.toFixed(2)} | ${t.reason} |`);
          }
        }

        lines.push("", "⚠️ 回测结果基于历史数据，不构成投资建议");

        if (reportPath) {
          lines.push("", `📄 可视化报告已生成: ${reportPath}`);
        }

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `回测失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
