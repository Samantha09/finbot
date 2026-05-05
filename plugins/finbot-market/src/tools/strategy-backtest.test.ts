import { describe, it, expect } from "vitest";
import { createStrategyBacktestTool } from "./strategy-backtest.js";

const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";

describe("strategyBacktest tool", () => {
  it("tool 元数据正确", () => {
    const tool = createStrategyBacktestTool();
    expect(tool.name).toBe("strategyBacktest");
    expect(tool.parameters).toBeDefined();
  });

  it("不支持的代码格式报错", async () => {
    const tool = createStrategyBacktestTool();
    const result = await tool.execute("tc1", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("支持");
  });

  it.skipIf(skipRealApi)("A 股 MA 交叉回测成功", async () => {
    const tool = createStrategyBacktestTool();
    const result = await tool.execute("tc2", { symbol: "600519.SH", strategy: "MA_CROSSOVER", shortPeriod: 5, longPeriod: 20 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("600519.SH");
    expect(parsed.text).toContain("策略收益");
    expect(parsed.text).toContain("最大回撤");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.text).toContain("📄 可视化报告已生成:");
    expect(parsed.isError).toBeFalsy();
  }, 15000);

  it.skipIf(skipRealApi)("港股 RSI 回测成功", async () => {
    const tool = createStrategyBacktestTool();
    const result = await tool.execute("tc3", { symbol: "00700.HK", strategy: "RSI_THRESHOLD" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("00700.HK");
    expect(parsed.text).toContain("RSI");
    expect(parsed.text).toContain("📄 可视化报告已生成:");
    expect(parsed.isError).toBeFalsy();
  }, 15000);
});
