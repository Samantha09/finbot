import { describe, it, expect, vi, afterEach } from "vitest";
import { createEtfRotationStrategyTool, calculateMomentumScore, calculateFundScore, calculateValuationScore, calculateQualityScore, getAdvice, detectTheme, buildAutoPool } from "./etf-rotation-strategy.js";

describe("etfRotationStrategy scoring", () => {
  it("calculateMomentumScore short weights", () => {
    const score = calculateMomentumScore({ roc1m: 5, roc3m: 10, roc6m: 15 }, "short");
    const raw = 5 * 0.5 + 10 * 0.3 + 15 * 0.2;
    expect(score).toBeCloseTo((raw + 20) * 2.5, 1);
  });

  it("calculateMomentumScore medium weights", () => {
    const score = calculateMomentumScore({ roc1m: 5, roc3m: 10, roc6m: 15 }, "medium");
    const raw = 10 * 0.5 + 15 * 0.3 + 5 * 0.2;
    expect(score).toBeCloseTo((raw + 20) * 2.5, 1);
  });

  it("calculateMomentumScore long weights", () => {
    const score = calculateMomentumScore({ roc1m: 5, roc3m: 10, roc6m: 15 }, "long");
    const raw = 15 * 0.5 + 10 * 0.3 + 5 * 0.2;
    expect(score).toBeCloseTo((raw + 20) * 2.5, 1);
  });

  it("calculateFundScore positive flow", () => {
    const score = calculateFundScore({ netMainForce5d: 1000, netMainForce10d: 2000 });
    expect(score).toBeGreaterThan(50);
  });

  it("calculateFundScore negative flow", () => {
    const score = calculateFundScore({ netMainForce5d: -1000, netMainForce10d: -2000 });
    expect(score).toBeLessThan(50);
  });

  it("calculateValuationScore low pePercent", () => {
    const score = calculateValuationScore({ pePercent: 3, pbPercent: 4 });
    expect(score).toBeGreaterThan(90);
  });

  it("calculateValuationScore floor protection", () => {
    const score = calculateValuationScore({ pePercent: 1, pbPercent: 1 });
    expect(score).toBeCloseTo(100 - 5, 1); // floor at 5
  });

  it("calculateQualityScore good metrics", () => {
    const score = calculateQualityScore({ assetScale: 2e9, sharpRatio1y: 1.5, sharpRatio3y: 1.2 });
    expect(score).toBe(75);
  });

  it("getAdvice thresholds", () => {
    expect(getAdvice(80)).toBe("增持");
    expect(getAdvice(65)).toBe("持有");
    expect(getAdvice(50)).toBe("减持");
    expect(getAdvice(30)).toBe("观望");
  });
});

describe("detectTheme", () => {
  it("detects 宽基", () => {
    expect(detectTheme("沪深300ETF")).toBe("宽基");
    expect(detectTheme("中证500ETF")).toBe("宽基");
  });
  it("detects 科技", () => {
    expect(detectTheme("半导体ETF")).toBe("科技");
    expect(detectTheme("人工智能ETF")).toBe("科技");
  });
  it("detects 医药", () => {
    expect(detectTheme("医药ETF")).toBe("医药");
  });
  it("detects 港股", () => {
    expect(detectTheme("恒生科技ETF")).toBe("港股");
  });
  it("detects 美股", () => {
    expect(detectTheme("纳斯达克ETF")).toBe("美股");
  });
  it("returns 其他 for unknown", () => {
    expect(detectTheme("某某ETF")).toBe("其他");
  });
});

describe("buildAutoPool", () => {
  it("picks largest ETF per theme", () => {
    const list = [
      { tradeCode: "510300", secuAbbr: "沪深300ETF", assetScale: 1e9 },
      { tradeCode: "510500", secuAbbr: "中证500ETF", assetScale: 5e8 },
      { tradeCode: "159915", secuAbbr: "创业板ETF", assetScale: 8e8 },
      { tradeCode: "512480", secuAbbr: "半导体ETF", assetScale: 3e8 },
      { tradeCode: "512760", secuAbbr: "芯片ETF", assetScale: 6e8 },
    ];
    const pool = buildAutoPool(list as unknown as Record<string, unknown>[]);
    const codes = pool.map((i) => i.tradeCode).sort();
    expect(codes).toEqual(["510300", "512760"]);
  });
});

describe("etfRotationStrategy tool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return error for invalid period", async () => {
    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc1", { symbols: ["510050.SH"], period: "invalid", mode: "custom" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("周期");
  });

  it("should score and rank ETFs correctly", async () => {
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
                roc1m: 5,
                roc3m: 8,
                roc6m: 12,
                netMainForce5d: 1000,
                netMainForce10d: 2000,
                assetScale: 2e9,
                sharpRatio1y: 1.5,
                sharpRatio3y: 1.2,
                indexTempType: "low",
              },
              {
                tradeCode: "159915",
                secuAbbr: "创业板ETF",
                pePercent: 60,
                pbPercent: 55,
                roc1m: -2,
                roc3m: -5,
                roc6m: -8,
                netMainForce5d: -500,
                netMainForce10d: -1000,
                assetScale: 5e8,
                sharpRatio1y: 0.5,
                sharpRatio3y: 0.3,
                indexTempType: "high",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc2", { symbols: ["510050.SH", "159915.SZ"], period: "medium", mode: "custom" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("510050");
    expect(parsed.text).toContain("159915");
    expect(parsed.text).toContain("持有");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
    expect(parsed.text).toContain("本期调入调出建议");
  });

  it("should filter invalid codes and continue", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockImplementation((url, init) => {
      const body = JSON.parse((init as any).body);
      const args = body.args;
      if (args.tradeCode === "510050") {
        return Promise.resolve({
          json: async () => ({
            data: { data: { fundList: [{ tradeCode: "510050", secuAbbr: "50ETF", pePercent: 15, pbPercent: 20, roc1m: 5, roc3m: 8, roc6m: 12, netMainForce5d: 1000, netMainForce10d: 2000, assetScale: 2e9, sharpRatio1y: 1.5, sharpRatio3y: 1.2, indexTempType: "low" }] } },
          }),
        });
      }
      return Promise.resolve({
        json: async () => ({ data: { data: { fundList: [] } } }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc3", { symbols: ["510050.SH", "INVALID"], period: "medium", mode: "custom" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("510050");
  });

  it("should handle partial missing data with neutral scores", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510050",
                secuAbbr: "50ETF",
                // Only partial data: momentum partially missing
                roc1m: 5,
                // roc3m, roc6m missing
                pePercent: 15,
                // pbPercent missing
                // netMainForce and quality data missing
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc4", { symbols: ["510050.SH"], period: "medium", mode: "custom" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("510050");
    // When all values for a factor are missing, score should be 50 (neutral)
    expect(parsed.text).toContain("50.00");
  });

  it("should auto select ETFs and return rotation advice", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510300",
                secuAbbr: "沪深300ETF",
                assetScale: 2e9,
                pePercent: 20,
                pbPercent: 25,
                roc1m: 5,
                roc3m: 8,
                roc6m: 12,
                netMainForce5d: 1000,
                netMainForce10d: 2000,
                sharpRatio1y: 1.5,
                sharpRatio3y: 1.2,
                indexTempType: "low",
              },
              {
                tradeCode: "512480",
                secuAbbr: "半导体ETF",
                assetScale: 1e9,
                pePercent: 60,
                pbPercent: 55,
                roc1m: -2,
                roc3m: -5,
                roc6m: -8,
                netMainForce5d: -500,
                netMainForce10d: -1000,
                sharpRatio1y: 0.5,
                sharpRatio3y: 0.3,
                indexTempType: "high",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc5", { period: "medium" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("主题轮动策略");
    expect(parsed.text).toContain("510300");
    expect(parsed.text).toContain("512480");
    expect(parsed.text).toContain("中性主题");
    expect(parsed.text).toContain("回避主题");
    expect(parsed.text).toContain("本期调入调出建议");
  });

  it("should show specific buy/sell advice when dispersion is high", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510300",
                secuAbbr: "沪深300ETF",
                assetScale: 2e9,
                pePercent: 15,
                pbPercent: 15,
                roc1m: 8,
                roc3m: 12,
                roc6m: 15,
                netMainForce5d: 2000,
                netMainForce10d: 3000,
                sharpRatio1y: 1.5,
                sharpRatio3y: 1.2,
                indexTempType: "low",
              },
              {
                tradeCode: "512480",
                secuAbbr: "半导体ETF",
                assetScale: 1e9,
                pePercent: 70,
                pbPercent: 70,
                roc1m: -5,
                roc3m: -8,
                roc6m: -10,
                netMainForce5d: -1000,
                netMainForce10d: -2000,
                sharpRatio1y: 0.5,
                sharpRatio3y: 0.3,
                indexTempType: "high",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc6", { period: "medium" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("调仓紧迫度：高");
    expect(parsed.text).toContain("建议加仓/调入");
    expect(parsed.text).toContain("建议减仓/调出");
  });

  it("should advise holding when dispersion is low", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    // 所有 ETF 得分接近，分化不明显
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510300",
                secuAbbr: "沪深300ETF",
                assetScale: 2e9,
                pePercent: 45,
                pbPercent: 45,
                roc1m: 2,
                roc3m: 2,
                roc6m: 2,
                netMainForce5d: 200,
                netMainForce10d: 200,
                sharpRatio1y: 0.8,
                sharpRatio3y: 0.8,
                indexTempType: "ord",
              },
              {
                tradeCode: "159915",
                secuAbbr: "创业板ETF",
                assetScale: 1.5e9,
                pePercent: 48,
                pbPercent: 48,
                roc1m: 1,
                roc3m: 1,
                roc6m: 1,
                netMainForce5d: 100,
                netMainForce10d: 100,
                sharpRatio1y: 0.7,
                sharpRatio3y: 0.7,
                indexTempType: "ord",
              },
              {
                tradeCode: "512480",
                secuAbbr: "半导体ETF",
                assetScale: 1e9,
                pePercent: 50,
                pbPercent: 50,
                roc1m: 0,
                roc3m: 0,
                roc6m: 0,
                netMainForce5d: 0,
                netMainForce10d: 0,
                sharpRatio1y: 0.6,
                sharpRatio3y: 0.6,
                indexTempType: "ord",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc7", { period: "medium" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("调仓紧迫度：低");
    expect(parsed.text).toContain("维持现有配置");
    expect(parsed.text).toContain("减少不必要的调仓操作");
  });

  it("should give personalized advice based on holdings", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            fundList: [
              {
                tradeCode: "510300",
                secuAbbr: "沪深300ETF",
                assetScale: 2e9,
                pePercent: 15,
                pbPercent: 15,
                roc1m: 8,
                roc3m: 12,
                roc6m: 15,
                netMainForce5d: 2000,
                netMainForce10d: 3000,
                sharpRatio1y: 1.5,
                sharpRatio3y: 1.2,
                indexTempType: "low",
              },
              {
                tradeCode: "512480",
                secuAbbr: "半导体ETF",
                assetScale: 1e9,
                pePercent: 70,
                pbPercent: 70,
                roc1m: -5,
                roc3m: -8,
                roc6m: -10,
                netMainForce5d: -1000,
                netMainForce10d: -2000,
                sharpRatio1y: 0.5,
                sharpRatio3y: 0.3,
                indexTempType: "high",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createEtfRotationStrategyTool();
    const result = await tool.execute("tc8", {
      period: "medium",
      holdings: [
        { symbol: "512480.SH", ratio: 0.3 },
        { symbol: "510300.SH", ratio: 0.2 },
      ],
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("基于你的持仓的调仓建议");
    expect(parsed.text).toContain("持仓中得分偏低，建议调出");
    expect(parsed.text).toContain("512480");
    expect(parsed.text).toContain("持仓中表现强势，可继续持有或加仓");
    expect(parsed.text).toContain("510300");
  });
});
