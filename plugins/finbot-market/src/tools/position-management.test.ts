import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUpdatePositionTool, createGetPositionReportTool } from "./position-management.js";

let fileMap: Map<string, string> = new Map();

vi.mock("fs/promises", () => ({
  readFile: vi.fn((filePath: string) => {
    const data = fileMap.get(filePath);
    if (data === undefined) {
      const err = new Error("ENOENT") as any;
      err.code = "ENOENT";
      return Promise.reject(err);
    }
    return Promise.resolve(data);
  }),
  writeFile: vi.fn((filePath: string, data: string) => {
    fileMap.set(filePath, data);
    return Promise.resolve(undefined);
  }),
  appendFile: vi.fn((filePath: string, data: string) => {
    const existing = fileMap.get(filePath) || "";
    fileMap.set(filePath, existing + data);
    return Promise.resolve(undefined);
  }),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
  readdir: vi.fn(() => Promise.resolve([])),
}));

const sampleHolding = {
  symbol: "510310",
  name: "沪深300ETF易方达",
  quantity: 600,
  availableQuantity: 600,
  costPrice: 4.836,
  currentPrice: 4.804,
  marketValue: 2882.40,
  profit: -19.00,
  profitPercent: -0.0066,
};

const sampleTrade = {
  time: "09:33:05",
  symbol: "510310",
  name: "沪深300ETF易方达",
  direction: "buy" as const,
  price: 4.819,
  quantity: 400,
  amount: 1927.60,
};

const sampleSummary = {
  totalAsset: 124607.15,
  dailyProfit: -268.80,
  availableCash: 5723.35,
  holdingMarketValue: 118883.80,
  holdingProfit: -3953.48,
  positionRatio: 0.9541,
};

describe("updatePosition tool", () => {
  let tool: ReturnType<typeof createUpdatePositionTool>;

  beforeEach(() => {
    tool = createUpdatePositionTool();
    fileMap = new Map();
    vi.clearAllMocks();
  });

  it("tool metadata correct", () => {
    expect(tool.name).toBe("updatePosition");
    expect(tool.parameters).toBeDefined();
  });

  it("stores position data correctly", async () => {
    const result = await tool.execute("tc1", {
      date: "2026-05-12",
      holdings: [sampleHolding],
      trades: [sampleTrade],
      summary: sampleSummary,
    });

    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("2026-05-12");
    expect(parsed.text).toContain("510310");
  });

  it("overwrites existing data for same date", async () => {
    await tool.execute("tc1", {
      date: "2026-05-12",
      holdings: [sampleHolding],
      trades: [],
      summary: sampleSummary,
    });

    const result = await tool.execute("tc2", {
      date: "2026-05-12",
      holdings: [{ ...sampleHolding, quantity: 1000 }],
      trades: [],
      summary: sampleSummary,
    });

    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("已更新");
  });

  it("returns error on missing required fields", async () => {
    const result = await tool.execute("tc3", { date: "2026-05-12" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
  });
});
