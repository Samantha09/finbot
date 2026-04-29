import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const TechnicalAnalysisSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "标的代码，如 600519.SH、00700.HK、AAPL",
    },
    indicators: {
      type: "array" as const,
      items: {
        type: "string" as const,
        enum: ["MA", "RSI", "MACD", "BOLL", "KDJ"],
      },
      description: "技术指标（默认全部）",
    },
    period: {
      type: "string" as const,
      enum: ["daily", "weekly"],
      description: "K 线周期（默认 daily）",
    },
  },
  required: ["symbol"],
};

export interface Kline {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

export function parseKline(line: string): Kline {
  const [date, open, close, high, low, volume] = line.split(",");
  return {
    date,
    open: parseFloat(open),
    close: parseFloat(close),
    high: parseFloat(high),
    low: parseFloat(low),
    volume: parseInt(volume),
  };
}

export function calcMA(closes: number[], periods: number[] = [5, 10, 20, 60]): Map<number, number> {
  const result = new Map<number, number>();
  for (const p of periods) {
    if (closes.length < p) continue;
    const slice = closes.slice(-p);
    result.set(p, +(slice.reduce((a, b) => a + b, 0) / p).toFixed(2));
  }
  return result;
}

export function calcRSI(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

function ema(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let value = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    value = data[i] * k + value * (1 - k);
  }
  return value;
}

export function calcMACD(closes: number[]): { dif: number; dea: number; macd: number } | null {
  if (closes.length < 35) return null;

  const dif = ema(closes, 12) - ema(closes, 26);

  const difSeries: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    difSeries.push(ema(closes.slice(0, i), 12) - ema(closes.slice(0, i), 26));
  }

  const dea = difSeries.length >= 9 ? ema(difSeries, 9) : dif;
  const macd = (dif - dea) * 2;

  return {
    dif: +dif.toFixed(2),
    dea: +dea.toFixed(2),
    macd: +macd.toFixed(2),
  };
}

export function calcBOLL(closes: number[], period: number = 20): { upper: number; mid: number; lower: number } | null {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - mid) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);

  return {
    upper: +(mid + 2 * stddev).toFixed(2),
    mid: +mid.toFixed(2),
    lower: +(mid - 2 * stddev).toFixed(2),
  };
}

export function calcKDJ(klines: Kline[], period: number = 9): { k: number; d: number; j: number } | null {
  if (klines.length < period) return null;

  const recent = klines.slice(-period);
  const highest = Math.max(...recent.map((k) => k.high));
  const lowest = Math.min(...recent.map((k) => k.low));
  const close = recent[recent.length - 1].close;

  const range = highest - lowest;
  if (range === 0) return { k: 50, d: 50, j: 50 };

  const rsv = ((close - lowest) / range) * 100;

  return {
    k: +rsv.toFixed(2),
    d: +(50 * 2 / 3 + rsv / 3).toFixed(2),
    j: +(3 * rsv - 2 * (50 * 2 / 3 + rsv / 3)).toFixed(2),
  };
}

export async function fetchKlines(symbol: string, count: number, klt: string): Promise<Kline[]> {
  let secid: string;

  const hk = symbol.match(/^(\d{1,5})\.HK$/);
  if (hk) {
    secid = `116.${hk[1].padStart(5, "0")}`;
  } else {
    const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
    if (!m) throw new Error("技术分析支持 A 股（600519.SH）和港股（00700.HK）");
    const [, code, exchange] = m;
    secid = `${exchange === "SH" ? 1 : 0}.${code}`;
  }

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=1&lmt=${count}&end=20500101`;

  const response = await fetch(url);
  const json = await response.json();

  const raw: string[] = json.data?.klines ?? [];
  if (raw.length === 0) throw new Error("未获取到 K 线数据");

  return raw.map(parseKline);
}

function interpretRSI(rsi: number): string {
  if (rsi > 70) return "超买区间，注意回调风险";
  if (rsi < 30) return "超卖区间，可能存在反弹机会";
  return "中性区间";
}

function interpretMACD(macd: { dif: number; dea: number; macd: number }): string {
  if (macd.macd > 0 && macd.dif > macd.dea) return "多头趋势（DIF > DEA，柱线为正）";
  if (macd.macd < 0 && macd.dif < macd.dea) return "空头趋势（DIF < DEA，柱线为负）";
  return "趋势不明";
}

export function createTechnicalAnalysisTool(): AnyAgentTool {
  return {
    name: "technicalAnalysis",
    label: "Technical Analysis",
    description: "计算技术分析指标：MA、RSI、MACD、布林带、KDJ。支持 A 股和港股",
    parameters: TechnicalAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, indicators, period = "daily" } = params as {
        symbol: string;
        indicators?: string[];
        period?: string;
      };

      try {
        const klt = period === "weekly" ? "101" : "101";
        const klines = await fetchKlines(symbol, 120, klt);
        const closes = klines.map((k) => k.close);
        const selected = indicators?.length ? indicators : ["MA", "RSI", "MACD", "BOLL", "KDJ"];

        const lines: string[] = [
          `📊 ${symbol} 技术分析 (${period === "weekly" ? "周线" : "日线"})`,
          `数据截止: ${klines[klines.length - 1].date}`,
          `最新收盘: ${closes[closes.length - 1]}`,
          "",
        ];

        if (selected.includes("MA")) {
          const ma = calcMA(closes);
          lines.push("**均线 (MA)**:");
          for (const [p, v] of ma) {
            const trend = closes[closes.length - 1] > v ? "上方（偏多）" : "下方（偏空）";
            lines.push(`  MA${p}: ${v} — 价格在 ${trend}`);
          }
          lines.push("");
        }

        if (selected.includes("RSI")) {
          const rsi = calcRSI(closes);
          if (rsi !== null) {
            lines.push(`**RSI(14)**: ${rsi} — ${interpretRSI(rsi)}`);
            lines.push("");
          }
        }

        if (selected.includes("MACD")) {
          const macd = calcMACD(closes);
          if (macd) {
            lines.push("**MACD**:");
            lines.push(`  DIF: ${macd.dif}, DEA: ${macd.dea}, 柱线: ${macd.macd}`);
            lines.push(`  判断: ${interpretMACD(macd)}`);
            lines.push("");
          }
        }

        if (selected.includes("BOLL")) {
          const boll = calcBOLL(closes);
          if (boll) {
            const price = closes[closes.length - 1];
            const position = price > boll.upper ? "突破上轨（超买信号）"
              : price < boll.lower ? "跌破下轨（超卖信号）"
              : "轨道内运行";
            lines.push("**布林带 (BOLL)**:");
            lines.push(`  上轨: ${boll.upper}, 中轨: ${boll.mid}, 下轨: ${boll.lower}`);
            lines.push(`  当前: ${position}`);
            lines.push("");
          }
        }

        if (selected.includes("KDJ")) {
          const kdj = calcKDJ(klines);
          if (kdj) {
            const signal = kdj.k > 80 && kdj.d > 80 ? "超买"
              : kdj.k < 20 && kdj.d < 20 ? "超卖"
              : "中性";
            lines.push(`**KDJ(9)**: K=${kdj.k}, D=${kdj.d}, J=${kdj.j} — ${signal}`);
            lines.push("");
          }
        }

        lines.push("⚠️ 技术指标仅供参考，不构成投资建议");

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `技术分析失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
