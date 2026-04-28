import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("marketQuery tool", () => {
  let tool: ReturnType<typeof createMarketQueryTool>;

  beforeEach(() => {
    tool = createMarketQueryTool();
    vi.restoreAllMocks();
  });

  it("tool 元数据正确", () => {
    expect(tool.name).toBe("marketQuery");
    expect(tool.parameters).toBeDefined();
  });

  it("crypto 查询成功", async () => {
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

    const result = await tool.execute("tc1", { symbol: "BTC-USD" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("BTC-USD");
    expect(parsed.text).toContain("crypto");
    expect(parsed.text).toContain("65000");
    expect(parsed.isError).toBeFalsy();
  });

  it("股票查询成功", async () => {
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

    const result = await tool.execute("tc2", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("AAPL");
    expect(parsed.text).toContain("美股");
    expect(parsed.text).toContain("150");
    expect(parsed.isError).toBeFalsy();

    delete process.env.ALPHA_VANTAGE_API_KEY;
  });

  it("缺少 API Key 报错", async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;

    const result = await tool.execute("tc3", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("ALPHA_VANTAGE_API_KEY");
  });

  it("查询无数据报错", async () => {
    process.env.ALPHA_VANTAGE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ "Global Quote": {} }),
      }),
    );

    const result = await tool.execute("tc4", { symbol: "INVALID" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("失败");

    delete process.env.ALPHA_VANTAGE_API_KEY;
  });
});
