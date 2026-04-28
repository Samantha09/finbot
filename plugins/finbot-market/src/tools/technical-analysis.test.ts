import { describe, it, expect } from "vitest";
import { calcMA, calcRSI, calcMACD, calcBOLL, calcKDJ, createTechnicalAnalysisTool } from "./technical-analysis.js";

describe("calcMA", () => {
  const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  it("计算 MA5", () => {
    const ma = calcMA(closes, [5]);
    expect(ma.get(5)).toBeCloseTo(18, 1);
  });

  it("数据不足时跳过", () => {
    const ma = calcMA([1, 2, 3], [5]);
    expect(ma.has(5)).toBe(false);
  });

  it("多个周期同时计算", () => {
    const long = Array.from({ length: 70 }, (_, i) => 100 + i);
    const ma = calcMA(long, [5, 10, 20, 60]);
    expect(ma.size).toBe(4);
    expect(ma.get(5)!).toBeGreaterThan(ma.get(60)!);
  });
});

describe("calcRSI", () => {
  it("连续上涨 RSI = 100", () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
    expect(calcRSI(closes, 14)).toBe(100);
  });

  it("数据不足返回 null", () => {
    expect(calcRSI([1, 2, 3], 14)).toBeNull();
  });

  it("正常范围 [0, 100]", () => {
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
    const rsi = calcRSI(closes, 14);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(0);
    expect(rsi!).toBeLessThanOrEqual(100);
  });
});

describe("calcMACD", () => {
  it("数据不足返回 null", () => {
    expect(calcMACD([1, 2, 3])).toBeNull();
  });

  it("正常计算 DIF/DEA/MACD", () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const result = calcMACD(closes);
    expect(result).not.toBeNull();
    expect(typeof result!.dif).toBe("number");
    expect(typeof result!.dea).toBe("number");
    expect(typeof result!.macd).toBe("number");
  });
});

describe("calcBOLL", () => {
  it("数据不足返回 null", () => {
    expect(calcBOLL([1, 2, 3], 20)).toBeNull();
  });

  it("上轨 > 中轨 > 下轨", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5 + Math.random() * 5);
    const boll = calcBOLL(closes, 20);
    expect(boll).not.toBeNull();
    expect(boll!.upper).toBeGreaterThan(boll!.mid);
    expect(boll!.mid).toBeGreaterThan(boll!.lower);
  });
});

describe("calcKDJ", () => {
  it("数据不足返回 null", () => {
    expect(calcKDJ([{ date: "2026-01-01", open: 1, close: 1, high: 1, low: 1, volume: 1 }], 9)).toBeNull();
  });

  it("正常范围 K/D 在 [0, 100]", () => {
    const klines = Array.from({ length: 15 }, (_, i) => ({
      date: `2026-01-${i + 1}`,
      open: 100 + i,
      close: 100 + i + Math.random() * 2,
      high: 102 + i,
      low: 99 + i,
      volume: 1000,
    }));
    const kdj = calcKDJ(klines, 9);
    expect(kdj).not.toBeNull();
    expect(kdj!.k).toBeGreaterThanOrEqual(0);
    expect(kdj!.k).toBeLessThanOrEqual(100);
    expect(kdj!.d).toBeGreaterThanOrEqual(0);
    expect(kdj!.d).toBeLessThanOrEqual(100);
  });
});

describe("technicalAnalysis tool", () => {
  it("tool 元数据正确", () => {
    const tool = createTechnicalAnalysisTool();
    expect(tool.name).toBe("technicalAnalysis");
    expect(tool.parameters).toBeDefined();
  });

  it("非 A 股代码报错", async () => {
    const tool = createTechnicalAnalysisTool();
    const result = await tool.execute("tc1", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("A 股");
  });

  it("A 股查询成功（真实 API）", async () => {
    const tool = createTechnicalAnalysisTool();
    const result = await tool.execute("tc2", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("600519.SH");
    expect(parsed.text).toContain("MA");
    expect(parsed.text).toContain("RSI");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.isError).toBeFalsy();
  }, 15000);
});
