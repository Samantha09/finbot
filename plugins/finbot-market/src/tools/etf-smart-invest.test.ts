import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateMultiplier, getValuationLabel, createEtfSmartInvestTool } from "./etf-smart-invest.js";

describe("calculateMultiplier", () => {
  it("extremely undervalued", () => {
    expect(calculateMultiplier(5)).toBe(3.0);
    expect(calculateMultiplier(10)).toBe(3.0);
  });

  it("undervalued", () => {
    expect(calculateMultiplier(15)).toBe(2.0);
    expect(calculateMultiplier(20)).toBe(2.0);
  });

  it("slightly low", () => {
    expect(calculateMultiplier(25)).toBe(1.5);
    expect(calculateMultiplier(30)).toBe(1.5);
  });

  it("normal", () => {
    expect(calculateMultiplier(40)).toBe(1.0);
    expect(calculateMultiplier(50)).toBe(1.0);
  });

  it("slightly high", () => {
    expect(calculateMultiplier(60)).toBe(0.5);
    expect(calculateMultiplier(70)).toBe(0.5);
  });

  it("high", () => {
    expect(calculateMultiplier(80)).toBe(0.25);
    expect(calculateMultiplier(90)).toBe(0.25);
  });

  it("extremely high", () => {
    expect(calculateMultiplier(95)).toBe(0);
  });
});

describe("getValuationLabel", () => {
  it("returns correct labels", () => {
    expect(getValuationLabel(5)).toBe("极度低估");
    expect(getValuationLabel(35)).toBe("正常");
    expect(getValuationLabel(85)).toBe("高估");
  });
});

describe("etfSmartInvest tool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should calculate invest suggestion correctly", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510050",
                secuAbbr: "50ETF",
                pePercent: 15,
                pbPercent: 20,
                indexTempType: "low",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfSmartInvestTool();
    const result = await tool.execute("tc1", { symbol: "510050.SH", baseAmount: 1000 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("50ETF");
    expect(parsed.text).toContain("2.0x");
    expect(parsed.text).toContain("2000");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("should fallback to indexTempType when pePercent missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510050",
                secuAbbr: "50ETF",
                pePercent: null,
                pbPercent: null,
                indexTempType: "low",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfSmartInvestTool();
    const result = await tool.execute("tc2", { symbol: "510050.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("1.5x");
  });

  it("should return error when all data missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510050",
                secuAbbr: "50ETF",
                pePercent: null,
                pbPercent: null,
                indexTempType: null,
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfSmartInvestTool();
    const result = await tool.execute("tc3", { symbol: "510050.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
  });

  it("should warn on data conflict", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510050",
                secuAbbr: "50ETF",
                pePercent: 65,
                pbPercent: 60,
                indexTempType: "low",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfSmartInvestTool();
    const result = await tool.execute("tc4", { symbol: "510050.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("数据不一致");
  });
});
