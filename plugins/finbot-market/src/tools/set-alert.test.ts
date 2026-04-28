import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSetAlertTool } from "./set-alert.js";

let alertsData: unknown[] = [];

vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(alertsData))),
  writeFile: vi.fn(() => Promise.resolve(undefined)),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
}));

describe("setAlert tool", () => {
  let tool: ReturnType<typeof createSetAlertTool>;

  beforeEach(() => {
    tool = createSetAlertTool();
    alertsData = [];
    vi.clearAllMocks();
  });

  it("tool 元数据正确", () => {
    expect(tool.name).toBe("setAlert");
    expect(tool.parameters).toBeDefined();
  });

  it("创建 above 提醒", async () => {
    const result = await tool.execute("tc1", {
      symbol: "AAPL",
      condition: "above",
      price: 200,
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("AAPL");
    expect(parsed.text).toContain("≥");
    expect(parsed.text).toContain("200");
    expect(parsed.text).toContain("已设置");
    expect(parsed.isError).toBeFalsy();
  });

  it("创建 below 提醒", async () => {
    const result = await tool.execute("tc2", {
      symbol: "BTC-USD",
      condition: "below",
      price: 50000,
      message: "止损线触发",
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("BTC-USD");
    expect(parsed.text).toContain("≤");
    expect(parsed.text).toContain("50000");
    expect(parsed.text).toContain("止损线触发");
  });

  it("自动生成默认 message", async () => {
    const result = await tool.execute("tc3", {
      symbol: "GOOGL",
      condition: "above",
      price: 180,
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("上涨至");
  });
});
