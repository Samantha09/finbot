import { describe, it, expect, vi } from "vitest";
import {
  createMarketHeatmapTool,
  formatHeatmapOutput,
} from "./market-heatmap.js";

const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";

describe("formatHeatmapOutput", () => {
  it("格式化完整输出", () => {
    const sectors = [
      { name: "计算机", changePercent: 3.45, netInflow: 4520000000 },
      { name: "电子", changePercent: 2.89, netInflow: 3870000000 },
      { name: "通信", changePercent: 2.12, netInflow: 2210000000 },
      { name: "煤炭", changePercent: -2.15, netInflow: -1830000000 },
      { name: "银行", changePercent: -1.02, netInflow: -1250000000 },
    ];
    const output = formatHeatmapOutput("A股", sectors);
    expect(output).toContain("A股 行业热力图");
    expect(output).toContain("领涨行业");
    expect(output).toContain("计算机 +3.45%");
    expect(output).toContain("主力净流入 +45.2亿");
    expect(output).toContain("领跌行业");
    expect(output).toContain("煤炭 -2.15%");
    expect(output).toContain("主力净流出 -18.3亿");
    expect(output).toContain("⚠️ 不构成投资建议");
  });

  it("空数据时显示数据暂缺", () => {
    const output = formatHeatmapOutput("A股", []);
    expect(output).toContain("未能获取到行业数据");
  });

  it("仅上涨行业", () => {
    const sectors = [
      { name: "计算机", changePercent: 1.5, netInflow: 1000000000 },
    ];
    const output = formatHeatmapOutput("A股", sectors);
    expect(output).toContain("领涨行业");
    expect(output).not.toContain("领跌行业");
  });
});

describe("marketHeatmap tool", () => {
  it("tool 元数据正确", () => {
    const tool = createMarketHeatmapTool();
    expect(tool.name).toBe("marketHeatmap");
    expect(tool.parameters).toBeDefined();
  });
});

describe("marketHeatmap tool mock tests", () => {
  it("mock 测试返回完整热力图", async () => {
    const tool = createMarketHeatmapTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("push2.eastmoney.com") && url.includes("fs=m:90+t:2")) {
        return {
          json: () => Promise.resolve({
            data: {
              diff: [
                { f14: "计算机", f3: 345, f62: 4520000000 },
                { f14: "电子", f3: 289, f62: 3870000000 },
                { f14: "通信", f3: 212, f62: 2210000000 },
                { f14: "煤炭", f3: -215, f62: -1830000000 },
                { f14: "银行", f3: -102, f62: -1250000000 },
              ],
            },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc1", { market: "A股" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("A股 行业热力图");
    expect(parsed.text).toContain("计算机");
    expect(parsed.text).toContain("银行");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("mock 测试部分数据缺失", async () => {
    const tool = createMarketHeatmapTool();

    vi.stubGlobal("fetch", vi.fn(async () => {
      return {
        json: () => Promise.resolve({
          data: {
            diff: [
              { f14: "计算机", f3: 345, f62: 4520000000 },
              { f14: "电子", f3: null, f62: null },
            ],
          },
        }),
      };
    }));

    const result = await tool.execute("tc2", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("计算机");
  });

  it("mock 测试接口完全失败", async () => {
    const tool = createMarketHeatmapTool();

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));

    const result = await tool.execute("tc3", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("获取失败");
  });

  it.skipIf(skipRealApi)("真实 A股行业接口返回数据", async () => {
    const tool = createMarketHeatmapTool();
    const result = await tool.execute("tc4", { market: "A股" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("行业热力图");
  });
});
