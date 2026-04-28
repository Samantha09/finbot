import { describe, it, expect } from "vitest";
import { createFundamentalAnalysisTool } from "./fundamental-analysis.js";

describe("fundamentalAnalysis tool", () => {
  it("tool 元数据正确", () => {
    const tool = createFundamentalAnalysisTool();
    expect(tool.name).toBe("fundamentalAnalysis");
    expect(tool.parameters).toBeDefined();
  });

  it("非 A 股代码报错", async () => {
    const tool = createFundamentalAnalysisTool();
    const result = await tool.execute("tc1", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("A 股");
  });

  it("真实 A 股查询成功", async () => {
    const tool = createFundamentalAnalysisTool();
    const result = await tool.execute("tc2", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("600519.SH");
    expect(parsed.text).toContain("EPS");
    expect(parsed.text).toContain("ROE");
    expect(parsed.text).toContain("毛利率");
    expect(parsed.text).toContain("净利率");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.isError).toBeFalsy();
  }, 15000);

  it("深市股票查询", async () => {
    const tool = createFundamentalAnalysisTool();
    const result = await tool.execute("tc3", { symbol: "000858.SZ" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("000858.SZ");
    expect(parsed.text).toContain("EPS");
    expect(parsed.isError).toBeFalsy();
  }, 15000);
});
