import { describe, it, expect } from "vitest";
import { createRiskAssessmentTool, assessRisk, suggestMaxPosition } from "./risk-assessment.js";

describe("assessRisk", () => {
  it("crypto 基础分更高", () => {
    const crypto = assessRisk("BTC-USD", 0.1);
    const stock = assessRisk("AAPL", 0.1);
    expect(crypto.score).toBeGreaterThan(stock.score);
  });

  it("高仓位抬高风险分", () => {
    const low = assessRisk("AAPL", 0.05);
    const high = assessRisk("AAPL", 0.4);
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.level).toMatch(/高|极高/);
  });

  it("A 股不额外加分", () => {
    const result = assessRisk("000001.SZ", 0.05);
    expect(result.score).toBeLessThanOrEqual(6);
  });

  it("港股 +1 分", () => {
    const hk = assessRisk("00700.HK", 0.05);
    const cn = assessRisk("000001.SZ", 0.05);
    expect(hk.score).toBe(cn.score + 1);
  });

  it("债券代码返回低风险", () => {
    const bond = assessRisk("019741", 0.1);
    expect(bond.level).toBe("低");
    expect(bond.score).toBeLessThanOrEqual(3);
    expect(bond.factors[0]).toContain("债券/固收");

    const repo = assessRisk("204001", 0.1);
    expect(repo.level).toBe("低");
    expect(repo.score).toBeLessThanOrEqual(3);
  });

  it("分数范围 [1, 10]", () => {
    for (const symbol of ["BTC-USD", "AAPL", "000001.SZ", "00700.HK"]) {
      for (const pos of [0.01, 0.1, 0.3, 0.5, 0.9]) {
        const { score } = assessRisk(symbol, pos);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe("suggestMaxPosition", () => {
  it("风险越高建议仓位越低", () => {
    expect(suggestMaxPosition(9)).toBeLessThan(suggestMaxPosition(5));
    expect(suggestMaxPosition(5)).toBeLessThan(suggestMaxPosition(3));
  });

  it("返回合理百分比", () => {
    for (let s = 1; s <= 10; s++) {
      const pos = suggestMaxPosition(s);
      expect(pos).toBeGreaterThan(0);
      expect(pos).toBeLessThanOrEqual(30);
    }
  });
});

describe("riskAssessment tool", () => {
  it("tool 元数据正确", () => {
    const tool = createRiskAssessmentTool();
    expect(tool.name).toBe("riskAssessment");
    expect(tool.parameters).toBeDefined();
  });

  it("execute 返回正确格式", async () => {
    const tool = createRiskAssessmentTool();
    const result = await tool.execute("tc1", { symbol: "BTC-USD", positionSize: 0.2 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("BTC-USD");
    expect(parsed.text).toContain("风险");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.isError).toBeFalsy();
  });

  it("默认仓位 0.1", async () => {
    const tool = createRiskAssessmentTool();
    const result = await tool.execute("tc2", { symbol: "AAPL" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("AAPL");
    expect(parsed.isError).toBeFalsy();
  });
});
