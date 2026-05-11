import { describe, it, expect } from "vitest";
import {
  ema,
  calcMACDSeries,
  detectCross,
  calcKDJSeries,
  detectKDJCross,
  calcVolumeScore,
  getMASignal,
  getMACDSignal,
  getRSISignal,
  getBOLLSignal,
  getKDJSignal,
  getVolumeSignal,
  getOverallRating,
  createEtfTimingSignalTool,
} from "./etf-timing-signal.js";
import type { Kline } from "./technical-analysis.js";

describe("ema", () => {
  it("matches technical-analysis ema", () => {
    const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const result = ema(data, 5);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(10);
  });
});

describe("calcMACDSeries", () => {
  it("returns series with correct length", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const series = calcMACDSeries(closes);
    expect(series.length).toBeGreaterThan(0);
    expect(series[series.length - 1]).toHaveProperty("dif");
    expect(series[series.length - 1]).toHaveProperty("dea");
    expect(series[series.length - 1]).toHaveProperty("macd");
  });

  it("detects golden cross", () => {
    const series = [
      { dif: -0.5, dea: -0.3, macd: -0.4 },
      { dif: -0.2, dea: -0.25, macd: 0.1 },
      { dif: 0.1, dea: 0.05, macd: 0.1 },
    ];
    expect(detectCross(series)).toBe("golden");
  });

  it("detects death cross", () => {
    const series = [
      { dif: 0.5, dea: 0.3, macd: 0.4 },
      { dif: 0.2, dea: 0.25, macd: -0.1 },
      { dif: -0.1, dea: -0.05, macd: -0.1 },
    ];
    expect(detectCross(series)).toBe("death");
  });

  it("detects no cross", () => {
    const series = [
      { dif: 0.5, dea: 0.3, macd: 0.4 },
      { dif: 0.6, dea: 0.4, macd: 0.4 },
    ];
    expect(detectCross(series)).toBe("none");
  });
});

describe("calcKDJSeries", () => {
  it("returns KDJ series", () => {
    const klines: Kline[] = Array.from({ length: 15 }, (_, i) => ({
      date: `2026-01-${i + 1}`,
      open: 100 + i,
      close: 100 + i + 1,
      high: 102 + i,
      low: 99 + i,
      volume: 1000,
    }));
    const series = calcKDJSeries(klines);
    expect(series.length).toBeGreaterThan(0);
    expect(series[0]).toHaveProperty("k");
    expect(series[0]).toHaveProperty("d");
  });

  it("detects KDJ golden cross", () => {
    const series = [
      { k: 15, d: 20 },
      { k: 25, d: 22 },
    ];
    expect(detectKDJCross(series)).toBe("golden");
  });
});

describe("signal scoring", () => {
  it("getMASignal bullish", () => {
    const ma = new Map([[5, 11], [10, 10], [20, 9], [60, 8]]);
    const signal = getMASignal(ma);
    expect(signal.score).toBe(30);
    expect(signal.label).toBe("多头排列");
  });

  it("getMASignal bearish", () => {
    const ma = new Map([[5, 8], [10, 9], [20, 10], [60, 11]]);
    const signal = getMASignal(ma);
    expect(signal.score).toBe(-30);
    expect(signal.label).toBe("空头排列");
  });

  it("getMACDSignal golden cross", () => {
    const signal = getMACDSignal("golden", { dif: 0.1, dea: 0.05, macd: 0.1 });
    expect(signal.score).toBe(25);
    expect(signal.label).toBe("金叉");
  });

  it("getRSISignal oversold", () => {
    const signal = getRSISignal(25);
    expect(signal.score).toBe(15);
    expect(signal.label).toBe("超卖");
  });

  it("getBOLLSignal below lower", () => {
    const signal = getBOLLSignal(2.0, { upper: 2.6, mid: 2.4, lower: 2.2 });
    expect(signal.score).toBe(10);
    expect(signal.label).toBe("跌破下轨");
  });

  it("getKDJSignal overbought", () => {
    const signal = getKDJSignal({ k: 85, d: 82 });
    expect(signal.score).toBe(-10);
    expect(signal.label).toBe("超买");
  });

  it("getVolumeSignal surge up", () => {
    const klines: Kline[] = [
      { date: "d1", open: 10, close: 10, high: 10, low: 10, volume: 1000 },
      { date: "d2", open: 10, close: 10, high: 10, low: 10, volume: 1000 },
      { date: "d3", open: 10, close: 10, high: 10, low: 10, volume: 1000 },
      { date: "d4", open: 10, close: 10, high: 10, low: 10, volume: 1000 },
      { date: "d5", open: 10, close: 10, high: 10, low: 10, volume: 1000 },
      { date: "d6", open: 10, close: 11, high: 11, low: 10, volume: 1300 },
    ];
    const signal = getVolumeSignal(klines);
    expect(signal.score).toBe(10);
    expect(signal.label).toBe("放量上涨");
  });

  it("getOverallRating buy", () => {
    expect(getOverallRating(65)).toBe("买入");
    expect(getOverallRating(45)).toBe("观望偏强");
    expect(getOverallRating(15)).toBe("观望偏弱");
    expect(getOverallRating(-15)).toBe("卖出");
  });
});

describe("etfTimingSignal tool", () => {
  it("tool metadata correct", () => {
    const tool = createEtfTimingSignalTool();
    expect(tool.name).toBe("etfTimingSignal");
    expect(tool.parameters).toBeDefined();
  });

  it("invalid symbol format returns error", async () => {
    const tool = createEtfTimingSignalTool();
    const result = await tool.execute("tc1", { symbol: "INVALID" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
  });
});
