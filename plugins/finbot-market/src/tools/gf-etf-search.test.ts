import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGfEtfList, createGfEtfSearchTool } from "./gf-etf-search.js";

describe("gfEtfSearch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when GF_SKILLS_APIKEY is missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "");
    await expect(fetchGfEtfList({})).rejects.toThrow("GF_SKILLS_APIKEY not configured");
  });

  it("should call GF API with correct payload", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            count: 1,
            fundList: [
              {
                tradeCode: "510050",
                secuAbbr: "50ETF",
                extName: "华夏上证50ETF",
                exchangeCode: "101",
                fiInfoName: "上证50",
                fiInfoCode: "000016",
                fundSize: 5000000000,
                assetScale: 5000000000,
                pe: 10,
                pePercent: 30,
                pb: 1.2,
                pbPercent: 25,
                roc: 0.5,
                roc1w: 1.2,
                roc1m: 5.0,
                roc6m: 10.0,
                roc1y: 20.0,
                netMainForce1d: 1000000,
                netMainForce5d: 5000000,
                premium: -0.1,
                indexTempType: "low",
                trakName: "宽基",
                trakType: "宽基",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchGfEtfList({ trakType: "宽基", limit: 5 });
    expect(result.data?.data?.fundList).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": "Bearer test-key",
        }),
        body: expect.stringContaining("etf_search"),
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

    const tool = createGfEtfSearchTool();
    const result = await tool.execute("test-id", { trakType: "宽基" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("接口返回异常");
  });

  it("should return empty message when no results", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            data: {
              count: 0,
              fundList: [],
            },
          },
        }),
      }),
    );

    const tool = createGfEtfSearchTool();
    const result = await tool.execute("test-id", { trakType: "不存在" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("未找到");
  });
});
