import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import { fetchKlines, calcMA, calcRSI, calcBOLL, type Kline } from "./technical-analysis.js";

const EtfTimingSignalSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "ETF 代码，如 510050.SH、159915.SZ",
    },
    period: {
      type: "string" as const,
      enum: ["daily", "weekly"],
      description: "K 线周期（默认 daily）",
    },
  },
  required: ["symbol"],
};

export function ema(data: number[], period: number): number {
  const k = 2 / (period + 1);
  let value = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    value = data[i] * k + value * (1 - k);
  }
  return value;
}

export function calcMACDSeries(closes: number[]): Array<{ dif: number; dea: number; macd: number }> {
  if (closes.length < 35) return [];
  const difSeries: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    difSeries.push(ema(closes.slice(0, i), 12) - ema(closes.slice(0, i), 26));
  }
  if (difSeries.length < 9) return [];
  const series: Array<{ dif: number; dea: number; macd: number }> = [];
  for (let i = 9; i <= difSeries.length; i++) {
    const dea = ema(difSeries.slice(0, i), 9);
    const dif = difSeries[i - 1];
    series.push({
      dif: +dif.toFixed(2),
      dea: +dea.toFixed(2),
      macd: +((dif - dea) * 2).toFixed(2),
    });
  }
  return series;
}

export function detectCross(series: Array<{ dif: number; dea: number; macd: number }>): "golden" | "death" | "none" {
  if (series.length < 2) return "none";
  for (let i = series.length - 1; i > 0; i--) {
    const prev = series[i - 1];
    const curr = series[i];
    if (prev.dif <= prev.dea && curr.dif > curr.dea) return "golden";
    if (prev.dif >= prev.dea && curr.dif < curr.dea) return "death";
  }
  return "none";
}

export function calcKDJSeries(klines: Kline[]): Array<{ k: number; d: number }> {
  if (klines.length < 9) return [];
  let k = 50;
  let d = 50;
  const series: Array<{ k: number; d: number }> = [];
  for (let i = 8; i < klines.length; i++) {
    const slice = klines.slice(i - 8, i + 1);
    const highest = Math.max(...slice.map((item) => item.high));
    const lowest = Math.min(...slice.map((item) => item.low));
    const close = klines[i].close;
    const range = highest - lowest;
    const rsv = range === 0 ? 50 : ((close - lowest) / range) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
    series.push({ k: +k.toFixed(2), d: +d.toFixed(2) });
  }
  return series;
}

export function detectKDJCross(series: Array<{ k: number; d: number }>): "golden" | "death" | "none" {
  if (series.length < 2) return "none";
  const prev = series[series.length - 2];
  const curr = series[series.length - 1];
  if (prev.k <= prev.d && curr.k > curr.d) return "golden";
  if (prev.k >= prev.d && curr.k < curr.d) return "death";
  return "none";
}

export function calcVolumeScore(klines: Kline[]): { score: number; label: string; desc: string } {
  if (klines.length < 6) return { score: 0, label: "成交量不足", desc: "数据不足" };
  const last5 = klines.slice(-6, -1);
  const today = klines[klines.length - 1];
  const avgVolume = last5.reduce((sum, k) => sum + k.volume, 0) / last5.length;
  const isSurge = today.volume > avgVolume * 1.2;
  const isUp = today.close > today.open;
  if (isUp && isSurge) return { score: 10, label: "放量上涨", desc: "成交量较5日均量放大" };
  if (isUp) return { score: 5, label: "价涨量平", desc: "价格上涨，成交量平稳" };
  if (isSurge) return { score: -10, label: "放量下跌", desc: "成交量放大但价格下跌" };
  return { score: -5, label: "缩量下跌", desc: "价格下跌，成交量萎缩" };
}

export function getMASignal(ma: Map<number, number>): { score: number; label: string; desc: string } {
  const periods = [5, 10, 20, 60];
  const values = periods.map((p) => ma.get(p)).filter((v): v is number => v !== undefined);
  if (values.length < 2) return { score: 0, label: "均线不足", desc: "数据不足" };
  const isBullish = values.every((v, i) => i === 0 || v < values[i - 1]);
  const isBearish = values.every((v, i) => i === 0 || v > values[i - 1]);
  const descParts = periods
    .filter((p) => ma.has(p))
    .map((p) => `MA${p}(${ma.get(p)})`);
  const desc = descParts.join(">");
  if (isBullish) return { score: 30, label: "多头排列", desc };
  if (isBearish) return { score: -30, label: "空头排列", desc };
  return { score: 0, label: "均线震荡", desc };
}

export function getMACDSignal(
  cross: "golden" | "death" | "none",
  latest: { dif: number; dea: number; macd: number }
): { score: number; label: string; desc: string } {
  if (cross === "golden") return { score: 25, label: "金叉", desc: `DIF(${latest.dif})上穿DEA(${latest.dea})` };
  if (cross === "death") return { score: -25, label: "死叉", desc: `DIF(${latest.dif})下穿DEA(${latest.dea})` };
  if (latest.dif > latest.dea) return { score: 15, label: "多头", desc: `DIF(${latest.dif})>DEA(${latest.dea})` };
  if (latest.dif < latest.dea) return { score: -15, label: "空头", desc: `DIF(${latest.dif})<DEA(${latest.dea})` };
  return { score: 0, label: "MACD中性", desc: `DIF=${latest.dif}, DEA=${latest.dea}` };
}

export function getRSISignal(rsi: number): { score: number; label: string; desc: string } {
  if (rsi < 30) return { score: 15, label: "超卖", desc: `RSI=${rsi}，可能存在反弹机会` };
  if (rsi < 45) return { score: 5, label: "偏弱", desc: `RSI=${rsi}，接近超卖` };
  if (rsi <= 55) return { score: 0, label: "中性", desc: `RSI=${rsi}，多空均衡` };
  if (rsi <= 70) return { score: 5, label: "偏强", desc: `RSI=${rsi}，接近超买` };
  return { score: -10, label: "超买", desc: `RSI=${rsi}，注意回调风险` };
}

export function getBOLLSignal(
  price: number,
  boll: { upper: number; mid: number; lower: number }
): { score: number; label: string; desc: string } {
  if (price < boll.lower) return { score: 10, label: "跌破下轨", desc: `价格${price} < 下轨${boll.lower}` };
  if (price > boll.upper) return { score: -10, label: "突破上轨", desc: `价格${price} > 上轨${boll.upper}` };
  return { score: 0, label: "轨道内", desc: `下轨${boll.lower} < 价格${price} < 上轨${boll.upper}` };
}

export function getKDJSignal(
  kdj: { k: number; d: number },
  cross?: "golden" | "death" | "none"
): { score: number; label: string; desc: string } {
  if (kdj.k < 20 && kdj.d < 20) return { score: 10, label: "超卖", desc: `K=${kdj.k}, D=${kdj.d}` };
  if (kdj.k > 80 && kdj.d > 80) return { score: -10, label: "超买", desc: `K=${kdj.k}, D=${kdj.d}` };
  if (cross === "golden") return { score: 5, label: "金叉", desc: `K=${kdj.k}上穿D=${kdj.d}` };
  if (cross === "death") return { score: -5, label: "死叉", desc: `K=${kdj.k}下穿D=${kdj.d}` };
  return { score: 0, label: "KDJ中性", desc: `K=${kdj.k}, D=${kdj.d}` };
}

export function getVolumeSignal(klines: Kline[]): { score: number; label: string; desc: string } {
  return calcVolumeScore(klines);
}

export function getOverallRating(totalScore: number): string {
  if (totalScore >= 60) return "买入";
  if (totalScore >= 30) return "观望偏强";
  if (totalScore >= -10) return "观望偏弱";
  return "卖出";
}

export function createEtfTimingSignalTool(): AnyAgentTool {
  return {
    name: "etfTimingSignal",
    label: "ETF Timing Signal",
    description: "ETF 技术择时信号：综合均线、MACD、RSI、布林带、KDJ、成交量六大指标给出买卖评级",
    parameters: EtfTimingSignalSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, period = "daily" } = params as { symbol: string; period?: string };

      try {
        const klt = period === "weekly" ? "102" : "101";
        const klines = await fetchKlines(symbol, 120, klt);
        if (klines.length < 35) {
          return toToolResult({
            content: `K 线数据不足（仅 ${klines.length} 条），无法进行择时分析`,
            isError: true,
          });
        }
        const closes = klines.map((k) => k.close);
        const latestPrice = closes[closes.length - 1];

        const rows: Array<{ indicator: string; signal: string; score: number; desc: string }> = [];
        let totalScore = 0;

        try {
          const ma = calcMA(closes);
          const maSignal = getMASignal(ma);
          rows.push({ indicator: "均线排列", signal: maSignal.label, score: maSignal.score, desc: maSignal.desc });
          totalScore += maSignal.score;
        } catch {
          rows.push({ indicator: "均线排列", signal: "计算失败", score: 0, desc: "-" });
        }

        try {
          const macdSeries = calcMACDSeries(closes);
          const cross = detectCross(macdSeries);
          const latestMacd = macdSeries[macdSeries.length - 1];
          const macdSignal = getMACDSignal(cross, latestMacd);
          rows.push({ indicator: "MACD", signal: macdSignal.label, score: macdSignal.score, desc: macdSignal.desc });
          totalScore += macdSignal.score;
        } catch {
          rows.push({ indicator: "MACD", signal: "计算失败", score: 0, desc: "-" });
        }

        try {
          const rsi = calcRSI(closes);
          if (rsi !== null) {
            const rsiSignal = getRSISignal(rsi);
            rows.push({ indicator: "RSI", signal: rsiSignal.label, score: rsiSignal.score, desc: rsiSignal.desc });
            totalScore += rsiSignal.score;
          } else {
            rows.push({ indicator: "RSI", signal: "数据不足", score: 0, desc: "-" });
          }
        } catch {
          rows.push({ indicator: "RSI", signal: "计算失败", score: 0, desc: "-" });
        }

        try {
          const boll = calcBOLL(closes);
          if (boll) {
            const bollSignal = getBOLLSignal(latestPrice, boll);
            rows.push({ indicator: "布林带", signal: bollSignal.label, score: bollSignal.score, desc: bollSignal.desc });
            totalScore += bollSignal.score;
          } else {
            rows.push({ indicator: "布林带", signal: "数据不足", score: 0, desc: "-" });
          }
        } catch {
          rows.push({ indicator: "布林带", signal: "计算失败", score: 0, desc: "-" });
        }

        try {
          const kdjSeries = calcKDJSeries(klines);
          if (kdjSeries.length > 0) {
            const kdjCross = detectKDJCross(kdjSeries);
            const latestKdj = kdjSeries[kdjSeries.length - 1];
            const kdjSignal = getKDJSignal(latestKdj, kdjCross);
            rows.push({ indicator: "KDJ", signal: kdjSignal.label, score: kdjSignal.score, desc: kdjSignal.desc });
            totalScore += kdjSignal.score;
          } else {
            rows.push({ indicator: "KDJ", signal: "数据不足", score: 0, desc: "-" });
          }
        } catch {
          rows.push({ indicator: "KDJ", signal: "计算失败", score: 0, desc: "-" });
        }

        try {
          const volSignal = getVolumeSignal(klines);
          rows.push({ indicator: "成交量", signal: volSignal.label, score: volSignal.score, desc: volSignal.desc });
          totalScore += volSignal.score;
        } catch {
          rows.push({ indicator: "成交量", signal: "计算失败", score: 0, desc: "-" });
        }

        const rating = getOverallRating(totalScore);
        const periodLabel = period === "weekly" ? "周线" : "日线";

        const lines: string[] = [
          `## ${symbol} 择时信号（${periodLabel}）`,
          `**综合评级：${rating}（${totalScore}分）**`,
          "",
          "| 指标 | 信号 | 评分 | 说明 |",
          "|------|------|------|------|",
        ];
        for (const row of rows) {
          const scoreStr = row.score > 0 ? `+${row.score}` : `${row.score}`;
          lines.push(`| ${row.indicator} | ${row.signal} | ${scoreStr} | ${row.desc} |`);
        }
        lines.push("");

        const advices: string[] = [];
        for (const row of rows) {
          if (row.score >= 20) advices.push(`${row.indicator}${row.signal}形成强支撑`);
          else if (row.score <= -20) advices.push(`${row.indicator}${row.signal}形成强压力`);
        }
        const advice = advices.length > 0 ? advices.join("；") : "各指标信号不一，建议观望";
        lines.push(`**操作建议：** ${advice}`);
        lines.push("⚠️ 不构成投资建议");

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `择时分析失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
