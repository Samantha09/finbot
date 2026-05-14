import { describe, it, expect, beforeEach } from "vitest";
import { createPortfolioAnalysisTool } from "./portfolio-analysis.js";

describe("portfolioAnalysis tool", () => {
  let tool: ReturnType<typeof createPortfolioAnalysisTool>;

  beforeEach(() => {
    tool = createPortfolioAnalysisTool();
  });

  it("tool 元数据正确", () => {
    expect(tool.name).toBe("portfolioAnalysis");
    expect(tool.parameters).toBeDefined();
  });

  it("空持仓返回提示", async () => {
    const result = await tool.execute("tc1", { holdings: [] });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("持仓为空");
  });

  it("单一高仓位 → 高风险", async () => {
    const result = await tool.execute("tc1", {
      holdings: [
        { symbol: "AAPL", weight: 0.5 },
        { symbol: "GOOGL", weight: 0.3 },
        { symbol: "TSLA", weight: 0.2 },
      ],
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("AAPL");
    expect(parsed.text).toContain("高");
    expect(parsed.text).toContain("减仓");
    expect(parsed.isError).toBeFalsy();
  });

  it("分散持仓 → 低风险", async () => {
    const holdings = [
      { symbol: "AAPL", weight: 0.15 },
      { symbol: "GOOGL", weight: 0.15 },
      { symbol: "MSFT", weight: 0.15 },
      { symbol: "AMZN", weight: 0.15 },
      { symbol: "NVDA", weight: 0.15 },
      { symbol: "META", weight: 0.1 },
      { symbol: "TSLA", weight: 0.1 },
      { symbol: "JPM", weight: 0.05 },
    ];
    const result = await tool.execute("tc2", { holdings });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("低");
    expect(parsed.isError).toBeFalsy();
  });

  it("权重未归一化时给出建议", async () => {
    const result = await tool.execute("tc3", {
      holdings: [
        { symbol: "AAPL", weight: 0.4 },
        { symbol: "GOOGL", weight: 0.4 },
      ],
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("归一化");
  });

  it("持仓数量不足 5 只时建议分散", async () => {
    const result = await tool.execute("tc4", {
      holdings: [
        { symbol: "AAPL", weight: 0.34 },
        { symbol: "GOOGL", weight: 0.33 },
        { symbol: "MSFT", weight: 0.33 },
      ],
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("分散");
  });

  it("固收和现金类资产不参与权益集中度分析", async () => {
    const result = await tool.execute("tc6", {
      holdings: [
        { symbol: "AAPL", weight: 0.5, assetType: "equity" },
        { symbol: "GOOGL", weight: 0.3, assetType: "equity" },
        { symbol: "019741", weight: 0.15, assetType: "bond" },
        { symbol: "CASH", weight: 0.05, assetType: "cash" },
      ],
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("**权益类标的数量**: 2");
    expect(parsed.text).toContain("非权益类持仓");
    expect(parsed.text).toContain("019741");
    expect(parsed.text).toContain("CASH");
    // bond/cash 不在权益类持仓明细中
    const equitySection = parsed.text.split("### 权益类持仓明细")[1]?.split("### 非权益类持仓")[0] || "";
    expect(equitySection).not.toContain("019741");
    expect(equitySection).not.toContain("CASH");
  });

  it("输出包含持仓明细表格", async () => {
    const result = await tool.execute("tc5", {
      holdings: [
        { symbol: "AAPL", weight: 0.6, cost: 150 },
        { symbol: "GOOGL", weight: 0.4, cost: 2800 },
      ],
    });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("| 标的 | 权重 | 成本 |");
    expect(parsed.text).toContain("150");
    expect(parsed.text).toContain("2800");
  });
});
