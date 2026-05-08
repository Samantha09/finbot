import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGfStockF10, createGfStockF10Tool } from "./gf-stock-f10.js";

describe("gfStockF10", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when GF_SKILLS_APIKEY is missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "");
    await expect(fetchGfStockF10({ code: "000776", market: "SZ" })).rejects.toThrow(
      "GF_SKILLS_APIKEY not configured",
    );
  });

  it("should call GF API with correct payload", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            compName: "广发证券股份有限公司",
            boardName: "主板",
            listDate: "2010-08-06",
            businessScope: "证券经纪；证券投资咨询；与证券交易、证券投资活动有关的财务顾问；证券承销与保荐；证券自营；融资融券；证券投资基金代销；为期货公司提供中间介绍业务；代销金融产品。",
            industries: "资本市场服务",
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchGfStockF10({ code: "000776", market: "SZ" });
    expect(result.data?.data?.compName).toBe("广发证券股份有限公司");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: expect.stringContaining("wechat_f10"),
      }),
    );
  });

  it("should return error when API returns empty data", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ data: null }),
      }),
    );

    const tool = createGfStockF10Tool();
    const result = await tool.execute("test-id", { code: "000776", market: "SZ" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("接口返回异常");
  });

  it("should return error for invalid code", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfStockF10Tool();
    const result = await tool.execute("test-id", { code: "00077a", market: "SZ" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("纯数字");
  });

  it("should return error for invalid market", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfStockF10Tool();
    const result = await tool.execute("test-id", { code: "000776", market: "BJ" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("SH 或 SZ");
  });

  it("should auto uppercase market", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            compName: "测试公司",
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createGfStockF10Tool();
    await tool.execute("test-id", { code: "000001", market: "sz" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.args.market).toBe("SZ");
  });
});
