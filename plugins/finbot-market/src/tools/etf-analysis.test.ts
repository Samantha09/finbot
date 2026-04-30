import { describe, it, expect, vi } from "vitest";
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

  it("纯6位上海 ETF 自动补 SH", () => {
    expect(parseEtfSymbol("513050")).toEqual({ code: "513050", secid: "1.513050" });
  });

  it("纯6位深圳 ETF 自动补 SZ", () => {
    expect(parseEtfSymbol("159915")).toEqual({ code: "159915", secid: "0.159915" });
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

describe("etfAnalysis tool mock tests", () => {
  it("mock 测试返回完整分析", async () => {
    const tool = createEtfAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("push2.eastmoney.com")) {
        return {
          json: () => Promise.resolve({
            rc: 0,
            data: {
              f43: 26500, f170: 123, f47: 152000000, f135: 26480,
              f58: "华夏上证50ETF", f191: 120050000000, f192: 50, f193: "上证50指数",
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
        return { json: () => Promise.resolve({ rc: 0, data: { f43: 26500, f170: 0, f47: 0, f135: 26480, f58: "华夏上证50ETF" } }) };
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

  it("mock 测试 QDII ETF 显示汇率信息", async () => {
    const tool = createEtfAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("push2.eastmoney.com")) {
        return {
          json: () => Promise.resolve({
            rc: 0,
            data: {
              f43: 118100, f170: -123, f47: 10000000, f135: 118000,
              f58: "易方达中证海外中国互联网50ETF", f191: 40459000000, f192: 60, f193: "中证海外中国互联网50指数",
            },
          }),
        };
      }
      if (url.includes("RPT_FUND_PORTFOLIO_STOCK")) {
        return { json: () => Promise.resolve({ result: { data: [] } }) };
      }
      if (url.includes("RPT_ETF_MONEYFLOW")) {
        return { json: () => Promise.resolve({ result: { data: [] } }) };
      }
      if (url.includes("exchangerate-api.com")) {
        return { json: () => Promise.resolve({ rates: { CNY: 7.2345 } }) };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc4", { symbol: "513050" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("513050");
    expect(parsed.text).toContain("汇率影响（QDII）");
    expect(parsed.text).toContain("7.2345");
  });
});
