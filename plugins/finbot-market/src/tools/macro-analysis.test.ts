import { describe, it, expect, vi } from "vitest";
import {
  createMacroAnalysisTool,
  formatMacroOutput,
  parseIndicatorRows,
} from "./macro-analysis.js";

const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";

describe("parseIndicatorRows", () => {
  it("解析 CPI 数据", () => {
    const rows = [
      { NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 },
      { NATIONAL_SAME: 1.3, NATIONAL_SEQUENTIAL: 1.0 },
    ];
    const result = parseIndicatorRows(rows, {
      name: "CPI",
      reportName: "TEST",
      valueField: "NATIONAL_SAME",
      valueFormatter: (v: number) => `${v}%`,
      yoyChangeField: null,
      momChangeField: "NATIONAL_SEQUENTIAL",
      yoyUnit: "pp",
      momUnit: "%",
    });
    expect(result.name).toBe("CPI");
    expect(result.value).toBe("1%");
    expect(result.yoy).toBe("-0.3pp");
    expect(result.mom).toBe("-0.7%");
  });

  it("解析 PPI 数据（无环比字段，从前值指数计算）", () => {
    const rows = [
      { BASE_SAME: 0.5, BASE: 100.5 },
      { BASE_SAME: -0.9, BASE: 99.1 },
    ];
    const result = parseIndicatorRows(rows, {
      name: "PPI",
      reportName: "TEST",
      valueField: "BASE_SAME",
      valueFormatter: (v: number) => `${v}%`,
      yoyChangeField: null,
      momChangeField: null,
      yoyUnit: "pp",
      momUnit: "%",
    });
    expect(result.value).toBe("0.5%");
    expect(result.yoy).toBe("+1.4pp");
    expect(result.mom).toBe("+1.41%");
  });

  it("解析 PMI 数据（同比字段直接是 pp 变化）", () => {
    const rows = [
      { MAKE_INDEX: 50.3, MAKE_SAME: 2.65 },
      { MAKE_INDEX: 50.4, MAKE_SAME: -0.2 },
    ];
    const result = parseIndicatorRows(rows, {
      name: "PMI",
      reportName: "TEST",
      valueField: "MAKE_INDEX",
      valueFormatter: (v: number) => `${v}`,
      yoyChangeField: "MAKE_SAME",
      momChangeField: null,
      yoyUnit: "pp",
      momUnit: "pp",
    });
    expect(result.value).toBe("50.3");
    expect(result.yoy).toBe("+2.65pp");
    expect(result.mom).toBe("-0.1pp");
  });

  it("空数据返回数据暂缺", () => {
    const result = parseIndicatorRows([], {
      name: "CPI",
      reportName: "TEST",
      valueField: "NATIONAL_SAME",
      valueFormatter: (v: number) => `${v}%`,
      yoyChangeField: null,
      momChangeField: "NATIONAL_SEQUENTIAL",
      yoyUnit: "pp",
      momUnit: "%",
    });
    expect(result.value).toBe("数据暂缺");
    expect(result.yoy).toBeNull();
    expect(result.mom).toBeNull();
  });
});

describe("formatMacroOutput", () => {
  it("格式化完整输出", () => {
    const categories = [
      {
        category: "通胀",
        indicators: [
          { name: "CPI", value: "1.0%", yoy: "-0.3pp", mom: "-0.7%" },
          { name: "PPI", value: "0.5%", yoy: "+1.4pp", mom: "+1.41%" },
        ],
      },
      {
        category: "增长",
        indicators: [
          { name: "PMI", value: "50.3", yoy: "+2.65pp", mom: "-0.1pp" },
        ],
      },
    ];
    const output = formatMacroOutput(categories);
    expect(output).toContain("通胀:");
    expect(output).toContain("CPI: 1.0%");
    expect(output).toContain("PPI: 0.5%");
    expect(output).toContain("增长:");
    expect(output).toContain("PMI: 50.3");
    expect(output).toContain("⚠️ 不构成投资建议");
  });

  it("空分类不显示", () => {
    const categories = [
      { category: "通胀", indicators: [] },
      { category: "增长", indicators: [{ name: "PMI", value: "50.3", yoy: null, mom: null }] },
    ];
    const output = formatMacroOutput(categories);
    expect(output).not.toContain("通胀:");
    expect(output).toContain("增长:");
  });
});

describe("macroAnalysis tool", () => {
  it("tool 元数据正确", () => {
    const tool = createMacroAnalysisTool();
    expect(tool.name).toBe("macroAnalysis");
    expect(tool.parameters).toBeDefined();
    expect((tool.parameters as any).properties.category.enum).toContain("all");
  });
});

describe("macroAnalysis tool mock tests", () => {
  it("mock 测试返回完整分析", async () => {
    const tool = createMacroAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("RPT_ECONOMY_CPI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 },
                { NATIONAL_SAME: 1.3, NATIONAL_SEQUENTIAL: 1.0 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_PPI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { BASE_SAME: 0.5, BASE: 100.5 },
                { BASE_SAME: -0.9, BASE: 99.1 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_PMI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { MAKE_INDEX: 50.3, MAKE_SAME: 2.65 },
                { MAKE_INDEX: 50.4, MAKE_SAME: -0.2 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_GDP")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { SUM_SAME: 5.0, DOMESTICL_PRODUCT_BASE: 334193 },
                { SUM_SAME: 5.0, DOMESTICL_PRODUCT_BASE: 1401879 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_M2")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { M2_SAME: 8.7, M2_ABS: 3052000 },
                { M2_SAME: 8.8, M2_ABS: 3031000 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_FINANCING")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { FINANCING_SAME: 12.3, FINANCING_ABS: 123000 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_LPR")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { LPR1Y: 3.45, LPR5Y: 3.95 },
                { LPR1Y: 3.45, LPR5Y: 3.95 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_UNEMPLOYMENT")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { UNEMPLOYMENT_RATE: 5.2 },
                { UNEMPLOYMENT_RATE: 5.1 },
              ],
            },
          }),
        };
      }
      if (url.includes("133.USDCNH") || url.includes("133.USDCNY")) {
        return {
          json: () => Promise.resolve({
            rc: 0,
            data: { f43: 72345, f170: 12 },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc1", { category: "all" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("CPI");
    expect(parsed.text).toContain("PPI");
    expect(parsed.text).toContain("PMI");
    expect(parsed.text).toContain("GDP");
    expect(parsed.text).toContain("M2");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("mock 测试部分接口失败", async () => {
    const tool = createMacroAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("RPT_ECONOMY_CPI")) {
        return {
          json: () => Promise.resolve({
            result: {
              data: [
                { NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 },
              ],
            },
          }),
        };
      }
      if (url.includes("RPT_ECONOMY_PPI")) {
        throw new Error("timeout");
      }
      return { json: () => Promise.resolve({ result: { data: [] } }) };
    }));

    const result = await tool.execute("tc2", { category: "inflation" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("CPI");
    expect(parsed.text).toContain("PPI");
    expect(parsed.text).toContain("数据暂缺");
  });

  it("category 过滤正确", async () => {
    const tool = createMacroAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("RPT_ECONOMY_CPI")) {
        return { json: () => Promise.resolve({ result: { data: [{ NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.7 }] } }) };
      }
      return { json: () => Promise.resolve({ result: { data: [] } }) };
    }));

    const result = await tool.execute("tc3", { category: "inflation" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("通胀");
    expect(parsed.text).toContain("CPI");
    expect(parsed.text).not.toContain("PMI");
  });

  it.skipIf(skipRealApi)("真实 CPI 接口返回数据", async () => {
    const tool = createMacroAnalysisTool();
    const result = await tool.execute("tc4", { category: "inflation" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("CPI");
  });
});
