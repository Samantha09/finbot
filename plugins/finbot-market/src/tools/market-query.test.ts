import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMarketQueryTool, detectMarket } from "./market-query.js";

describe("detectMarket", () => {
  it("识别 A 股", () => {
    expect(detectMarket("000001.SZ")).toBe("A股");
    expect(detectMarket("600519.SH")).toBe("A股");
    expect(detectMarket("430047.BJ")).toBe("A股");
  });

  it("识别港股", () => {
    expect(detectMarket("00700.HK")).toBe("港股");
    expect(detectMarket("09988.HK")).toBe("港股");
  });

  it("识别 crypto", () => {
    expect(detectMarket("BTC-USD")).toBe("crypto");
    expect(detectMarket("ETH-USDT")).toBe("crypto");
  });

  it("默认识别为美股", () => {
    expect(detectMarket("AAPL")).toBe("美股");
    expect(detectMarket("GOOGL")).toBe("美股");
    expect(detectMarket("TSLA")).toBe("美股");
  });
});

function mockEastMoneyResponse(overrides: Record<string, number> = {}) {
  return {
    rc: 0,
    data: {
      f43: 140500, // price
      f44: 140939, // high
      f45: 140011, // low
      f46: 140200, // open
      f47: 34004, // volume
      f48: 4772513712, // amount
      f57: "600519",
      f58: "贵州茅台",
      f60: 140320, // prev close
      f169: 180, // change
      f170: 13, // change %
      ...overrides,
    },
  };
}

describe("marketQuery tool", () => {
  let tool: ReturnType<typeof createMarketQueryTool>;

  beforeEach(() => {
    tool = createMarketQueryTool();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
  });

  it("tool 元数据正确", () => {
    expect(tool.name).toBe("marketQuery");
    expect(tool.parameters).toBeDefined();
  });

  it("A 股查询走东方财富", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve(mockEastMoneyResponse()),
      }),
    );

    const result = await tool.execute("tc1", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("600519.SH");
    expect(parsed.text).toContain("A股");
    expect(parsed.text).toContain("1405");
    expect(parsed.isError).toBeFalsy();

    const fetchUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(fetchUrl).toContain("secid=1.600519");
  });

  it("港股查询走东方财富", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve(
            mockEastMoneyResponse({
              f43: 473800,
              f60: 478600,
              f170: -100,
            }),
          ),
      }),
    );

    const result = await tool.execute("tc2", { symbol: "00700.HK" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("00700.HK");
    expect(parsed.text).toContain("港股");
    expect(parsed.isError).toBeFalsy();

    const fetchUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(fetchUrl).toContain("secid=116.00700");
  });

  it("港股 4 位代码补零到 5 位", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve(
            mockEastMoneyResponse({
              f43: 65950,
              f60: 65800,
              f170: 23,
            }),
          ),
      }),
    );

    const result = await tool.execute("tc2b", { symbol: "0001.HK" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();

    const fetchUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(fetchUrl).toContain("secid=116.00001");
  });

  it("美股查询走 Alpha Vantage", async () => {
    process.env.ALPHA_VANTAGE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            "Global Quote": {
              "05. price": "150.00",
              "09. change": "2.50",
              "10. change percent": "1.69%",
              "06. volume": "50000000",
              "07. latest trading day": "2026-04-25",
            },
          }),
      }),
    );

    const result = await tool.execute("tc3", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("AAPL");
    expect(parsed.text).toContain("美股");
    expect(parsed.text).toContain("150");
    expect(parsed.isError).toBeFalsy();
  });

  it("crypto 查询走 CoinGecko", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            btc: {
              usd: 65000,
              usd_24h_change: 2.5,
              usd_24h_vol: 30000000000,
            },
          }),
      }),
    );

    const result = await tool.execute("tc4", { symbol: "BTC-USD" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("BTC-USD");
    expect(parsed.text).toContain("crypto");
    expect(parsed.text).toContain("65000");
    expect(parsed.isError).toBeFalsy();
  });

  it("缺少 Alpha Vantage Key 时美股报错", async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;

    const result = await tool.execute("tc5", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("ALPHA_VANTAGE_API_KEY");
  });

  it("东方财富返回异常报错", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ rc: 1, data: null }),
      }),
    );

    const result = await tool.execute("tc6", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("失败");
  });
});
