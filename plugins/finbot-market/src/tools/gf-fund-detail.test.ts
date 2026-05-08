import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGfFundDetail, createGfFundDetailTool } from "./gf-fund-detail.js";

describe("gfFundDetail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when GF_SKILLS_APIKEY is missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "");
    await expect(fetchGfFundDetail({ tradeCode: "519002" })).rejects.toThrow(
      "GF_SKILLS_APIKEY not configured",
    );
  });

  it("should call GF API with correct payload", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            tradeCode: "519002",
            chiName: "华安安信消费服务混合A",
            secuAbbr: "华安安信消费",
            fundType: "混合型",
            riskLevel: "中风险",
            shareNav: 1.2345,
            return1w: 1.2,
            return1m: 3.5,
            return3m: 8.2,
            return6m: 12.5,
            return1y: 25.3,
            return3y: 45.6,
            returnTn: 120.5,
            assetScale: 1500000000,
            fundManageCorp: "华安基金",
            contractEffDate: "2013-05-23",
            prodStatus: "正常",
            isAllowBuy: "1",
            isAllowRedeem: "1",
            min_share: 1000,
            min_share2: 100,
            extraInfo: {
              investTarget: "在严格控制风险的前提下，重点投资于消费服务类行业。",
              riskReturnFeature: "本基金为混合型基金，预期风险和预期收益高于债券型基金。",
            },
            report: "综合评级：优秀",
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchGfFundDetail({ tradeCode: "519002" });
    expect(result.data?.data?.tradeCode).toBe("519002");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: expect.stringContaining("jijin_info"),
      }),
    );
  });

  it("should handle string number values", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            tradeCode: "519002",
            chiName: "测试基金",
            shareNav: "1.2345",
            return1w: "1.2",
            return1m: "-0.5",
            assetScale: "1500000000",
            min_share: "1000",
            isAllowBuy: "1",
            isAllowRedeem: "0",
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createGfFundDetailTool();
    const result = await tool.execute("test-id", { tradeCode: "519002" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("测试基金");
    expect(parsed.text).toContain("+1.20%");
    expect(parsed.text).toContain("-0.50%");
    expect(parsed.text).toContain("可购买");
    expect(parsed.text).toContain("暂停赎回");
  });

  it("should return error when API returns empty data", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ data: null }),
      }),
    );

    const tool = createGfFundDetailTool();
    const result = await tool.execute("test-id", { tradeCode: "519002" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("接口返回异常");
  });

  it("should return error for empty tradeCode", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfFundDetailTool();
    const result = await tool.execute("test-id", { tradeCode: "" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("请提供基金交易代码");
  });
});
