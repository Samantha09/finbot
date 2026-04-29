import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCheckAlertsTool } from "./check-alerts.js";

let alertsData: unknown[] = [];

vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(alertsData))),
  writeFile: vi.fn(() => Promise.resolve(undefined)),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("./market-query.js", () => ({
  fetchQuote: vi.fn((symbol: string) => {
    const prices: Record<string, number> = {
      AAPL: 210,
      "BTC-USD": 48000,
      "600519.SH": 1405,
    };
    const price = prices[symbol];
    if (price === undefined) throw new Error(`Unknown symbol: ${symbol}`);
    return Promise.resolve({
      price,
      change: 0,
      changePercent: "0%",
      volume: 1000,
      latestTradingDay: "2026-04-29",
    });
  }),
}));

describe("checkAlerts tool", () => {
  let tool: ReturnType<typeof createCheckAlertsTool>;

  beforeEach(() => {
    tool = createCheckAlertsTool();
    alertsData = [];
    vi.clearAllMocks();
  });

  it("tool 元数据正确", () => {
    expect(tool.name).toBe("checkAlerts");
    expect(tool.parameters).toBeDefined();
  });

  it("没有待检查提醒时返回提示", async () => {
    const result = await tool.execute("tc1", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("没有待检查");
    expect(parsed.isError).toBeFalsy();
  });

  it("条件未满足时返回未触发", async () => {
    alertsData = [
      {
        id: "alert_1",
        symbol: "AAPL",
        condition: "above",
        price: 300,
        message: "目标价",
        createdAt: "2026-04-29T00:00:00Z",
        triggered: false,
      },
    ];

    const result = await tool.execute("tc2", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("未触发");
  });

  it("above 条件满足时触发并标记", async () => {
    alertsData = [
      {
        id: "alert_2",
        symbol: "AAPL",
        condition: "above",
        price: 200,
        message: "突破 200",
        createdAt: "2026-04-29T00:00:00Z",
        triggered: false,
      },
    ];

    const result = await tool.execute("tc3", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("已触发");
    expect(parsed.text).toContain("AAPL");
    expect(parsed.text).toContain("210");
  });

  it("below 条件满足时触发", async () => {
    alertsData = [
      {
        id: "alert_3",
        symbol: "BTC-USD",
        condition: "below",
        price: 50000,
        message: "止损",
        createdAt: "2026-04-29T00:00:00Z",
        triggered: false,
      },
    ];

    const result = await tool.execute("tc4", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("已触发");
    expect(parsed.text).toContain("BTC-USD");
  });

  it("dryRun 不标记 triggered", async () => {
    alertsData = [
      {
        id: "alert_4",
        symbol: "AAPL",
        condition: "above",
        price: 200,
        message: "突破",
        createdAt: "2026-04-29T00:00:00Z",
        triggered: false,
      },
    ];

    const { writeFile } = await import("fs/promises");
    const result = await tool.execute("tc5", { dryRun: true });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("已触发");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("单个查询失败不影响其他 alert", async () => {
    alertsData = [
      {
        id: "alert_5",
        symbol: "AAPL",
        condition: "above",
        price: 200,
        message: "突破",
        createdAt: "2026-04-29T00:00:00Z",
        triggered: false,
      },
      {
        id: "alert_6",
        symbol: "UNKNOWN",
        condition: "above",
        price: 100,
        message: "未知",
        createdAt: "2026-04-29T00:00:00Z",
        triggered: false,
      },
    ];

    const result = await tool.execute("tc6", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("已触发");
    expect(parsed.text).toContain("查询失败");
  });
});
