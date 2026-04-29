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
});
