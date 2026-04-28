import { describe, it, expect, beforeEach } from "vitest";
import { createNewsFetchTool } from "./news-fetch.js";

describe("newsFetch tool", () => {
  let tool: ReturnType<typeof createNewsFetchTool>;

  beforeEach(() => {
    tool = createNewsFetchTool();
  });

  it("tool 元数据正确", () => {
    expect(tool.name).toBe("newsFetch");
    expect(tool.parameters).toBeDefined();
  });

  it("A 股走东方财富公告 API", async () => {
    const result = await tool.execute("tc1", { symbol: "600519.SH", limit: 3 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("600519.SH");
    expect(parsed.text).toContain("新闻");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.isError).toBeFalsy();
  });

  it("港股走东方财富公告 API", async () => {
    const result = await tool.execute("tc2", { symbol: "00700.HK", limit: 2 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("00700.HK");
    expect(parsed.isError).toBeFalsy();
  });

  it("美股缺少 API Key 时提示配置", async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    const result = await tool.execute("tc3", { symbol: "AAPL", limit: 3 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("ALPHA_VANTAGE_API_KEY");
  });
});
