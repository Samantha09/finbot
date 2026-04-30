import { describe, it, expect, vi } from "vitest";
import {
  createSentimentAnalysisTool,
  classifySentiment,
  formatSentimentOutput,
} from "./sentiment-analysis.js";

const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";

describe("classifySentiment", () => {
  it("正面关键词", () => {
    expect(classifySentiment("一季度营收同比增长15%")).toBe("正面");
    expect(classifySentiment("股价突破历史新高")).toBe("正面");
    expect(classifySentiment("机构大幅增持")).toBe("正面");
  });

  it("负面关键词", () => {
    expect(classifySentiment("净利润同比下滑20%")).toBe("负面");
    expect(classifySentiment("遭遇监管处罚")).toBe("负面");
    expect(classifySentiment("股价大幅下跌")).toBe("负面");
  });

  it("中性/无关键词", () => {
    expect(classifySentiment("公司发布例行公告")).toBe("中性");
    expect(classifySentiment("今日收盘情况")).toBe("中性");
  });
});

describe("formatSentimentOutput", () => {
  it("格式化完整输出", () => {
    const news = [
      { title: "营收增长", sentiment: "正面" as const, source: "财联社", date: "2026-04-30" },
      { title: "例行公告", sentiment: "中性" as const, source: "东方财富", date: "2026-04-29" },
      { title: "利润下滑", sentiment: "负面" as const, source: "证券时报", date: "2026-04-28" },
    ];
    const output = formatSentimentOutput("600519", "贵州茅台", news);
    expect(output).toContain("贵州茅台(600519) 舆情概览");
    expect(output).toContain("[正面]");
    expect(output).toContain("[中性]");
    expect(output).toContain("[负面]");
    expect(output).toContain("中性（正面1条 / 中性1条 / 负面1条）");
    expect(output).toContain("⚠️ 不构成投资建议");
  });

  it("无新闻时显示获取失败", () => {
    const output = formatSentimentOutput("600519", "贵州茅台", []);
    expect(output).toContain("未能获取到相关新闻");
  });

  it("仅 keyword 时显示关键词", () => {
    const news = [
      { title: "AI利好", sentiment: "正面" as const, source: "财联社", date: "2026-04-30" },
    ];
    const output = formatSentimentOutput(null, "人工智能", news);
    expect(output).toContain("人工智能 舆情概览");
  });
});

describe("sentimentAnalysis tool", () => {
  it("tool 元数据正确", () => {
    const tool = createSentimentAnalysisTool();
    expect(tool.name).toBe("sentimentAnalysis");
    expect(tool.parameters).toBeDefined();
  });
});

describe("sentimentAnalysis tool mock tests", () => {
  it("mock 测试 symbol 路径返回完整分析", async () => {
    const tool = createSentimentAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("np-anotice-stock.eastmoney.com")) {
        return {
          json: () => Promise.resolve({
            data: {
              list: [
                { title_ch: "一季度营收同比增长15.2%", notice_date: "2026-04-30 10:00", art_code: "123", codes: [{ short_name: "贵州茅台" }] },
                { title_ch: "茅台批价回升至2850元", notice_date: "2026-04-29 14:00", art_code: "124", codes: [{ short_name: "贵州茅台" }] },
                { title_ch: "某券商下调白酒行业评级", notice_date: "2026-04-28 09:00", art_code: "125", codes: [{ short_name: "贵州茅台" }] },
              ],
            },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc1", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("600519");
    expect(parsed.text).toContain("[正面]");
    expect(parsed.text).toContain("[负面]");
    expect(parsed.text).toContain("⚠️ 不构成投资建议");
  });

  it("mock 测试 keyword 路径", async () => {
    const tool = createSentimentAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("searchapi.eastmoney.com")) {
        return {
          json: () => Promise.resolve({
            QuotationCodeTable: {
              Data: [
                { Title: "人工智能产业迎来政策利好", Url: "https://finance.eastmoney.com/a/1.html", Art_Time: "2026-04-30" },
                { Title: "AI板块今日表现平淡", Url: "https://finance.eastmoney.com/a/2.html", Art_Time: "2026-04-29" },
              ],
            },
          }),
        };
      }
      return { json: () => Promise.resolve({}) };
    }));

    const result = await tool.execute("tc2", { keyword: "人工智能" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("人工智能");
    expect(parsed.text).toContain("[正面]");
  });

  it("mock 测试新闻接口失败", async () => {
    const tool = createSentimentAnalysisTool();

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("timeout");
    }));

    const result = await tool.execute("tc3", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("未能获取");
  });

  it("参数校验：symbol 和 keyword 都为空", async () => {
    const tool = createSentimentAnalysisTool();
    const result = await tool.execute("tc4", {});
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("至少提供");
  });

  it.skipIf(skipRealApi)("真实 symbol 接口返回数据", async () => {
    const tool = createSentimentAnalysisTool();
    const result = await tool.execute("tc5", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBeFalsy();
    expect(parsed.text).toContain("600519");
  });
});
