import { describe, it, expect, vi, afterEach } from "vitest";
import { executeFundSelectionStrategy, createFundSelectionStrategyTool } from "./fund-selection-strategy.js";

describe("fundSelectionStrategy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("should return error for invalid strategy", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createFundSelectionStrategyTool();
    const result = await tool.execute("test-id", { strategy: "momentum", period: "short" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("策略类型必须是以下之一");
  });

  it("should return error for invalid period", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createFundSelectionStrategyTool();
    const result = await tool.execute("test-id", { strategy: "trend", period: "weekly" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("投资周期必须是以下之一");
  });

  it("should execute trend strategy", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          json: async () => ({
            data: {
              data: [
                {
                  code: "510050",
                  name: "50ETF",
                  exchange: 101,
                  roc: 2.5,
                  turnover_rate: 8.5,
                  fundSize: 5000000000,
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        json: async () => ({
          data: {
            data: {
              tradeCode: "510050",
              chiName: "华夏上证50ETF",
              shareNav: 2.5,
              return1m: 5.0,
              return3m: 12.0,
              isAllowBuy: "1",
              isAllowRedeem: "1",
            },
          },
        }),
      });
    }));

    const output = await executeFundSelectionStrategy("trend", "short", 3);
    expect(output).toContain("趋势跟随");
    expect(output).toContain("510050");
    expect(output).toContain("50ETF");
  });

  it("should execute contrarian strategy", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          json: async () => ({
            data: {
              data: [
                {
                  code: "510050",
                  name: "50ETF",
                  exchange: 101,
                  roc: -3.0,
                  fundSize: 5000000000,
                },
              ],
            },
          }),
        });
      }
      if (callCount === 2) {
        return Promise.resolve({
          json: async () => ({
            data: {
              data: [
                {
                  etfcode: "510050",
                  etfname: "50ETF",
                  mktCd: "SH",
                  fndNet: 5000,
                  fndNetPercent: 2.5,
                  details: [
                    { tradeDate: "2026-05-07", fndNetIn: 5000 },
                    { tradeDate: "2026-05-06", fndNetIn: 3000 },
                    { tradeDate: "2026-05-05", fndNetIn: 2000 },
                  ],
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        json: async () => ({
          data: {
            data: {
              tradeCode: "510050",
              chiName: "华夏上证50ETF",
              return3m: -15.0,
              isAllowBuy: "1",
              isAllowRedeem: "1",
            },
          },
        }),
      });
    }));

    const output = await executeFundSelectionStrategy("contrarian", "medium", 3);
    expect(output).toContain("逆势布局");
    expect(output).toContain("510050");
  });

  it("should execute balanced strategy", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          json: async () => ({
            data: {
              data: [
                {
                  code: "510050",
                  name: "50ETF",
                  exchange: 101,
                  roc: 1.0,
                  turnover_rate: 5.0,
                  fundSize: 5000000000,
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        json: async () => ({
          data: {
            data: {
              tradeCode: "510050",
              chiName: "华夏上证50ETF",
              return1y: 15.0,
              return3y: 45.0,
              isAllowBuy: "1",
              isAllowRedeem: "1",
              report: "综合评价：优秀",
            },
          },
        }),
      });
    }));

    const output = await executeFundSelectionStrategy("balanced", "long", 3);
    expect(output).toContain("均衡配置");
    expect(output).toContain("510050");
    expect(output).toContain("优秀");
  });
});
