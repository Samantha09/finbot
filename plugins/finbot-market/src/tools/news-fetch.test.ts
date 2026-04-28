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

  it("返回新闻列表", async () => {
    const result = await tool.execute("tc1", { symbol: "AAPL", limit: 2 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("AAPL");
    expect(parsed.text).toContain("新闻");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.isError).toBeFalsy();
  });

  it("limit 参数控制返回数量", async () => {
    const result = await tool.execute("tc2", { symbol: "TSLA", limit: 1 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("1 条");
  });
});
