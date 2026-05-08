import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGfEtfRank, createGfEtfRankTool } from "./gf-etf-rank.js";

describe("gfEtfRank", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when GF_SKILLS_APIKEY is missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "");
    await expect(fetchGfEtfRank({ type: 1 })).rejects.toThrow(
      "GF_SKILLS_APIKEY not configured",
    );
  });

  it("should call GF API with correct payload", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: [
            {
              code: "159915",
              name: "创业板ETF",
              ext_name: "易方达创业板ETF",
              exchange: 105,
              roc: 3.52,
              fiveRoc: 5.12,
              volume: 452300,
              cashFlow: 12345.67,
              turnover_rate: 8.5,
              fundSize: 8500000000,
              trackIndexName: "创业板指数",
              continueRiseDay: 3,
              premium: 0.12,
            },
          ],
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchGfEtfRank({ type: 1, size: 20 });
    expect(result.data?.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: expect.stringContaining("etf_rank"),
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

    const tool = createGfEtfRankTool();
    const result = await tool.execute("test-id", { type: 1 });
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
            data: [],
          },
        }),
      }),
    );

    const tool = createGfEtfRankTool();
    const result = await tool.execute("test-id", { type: 1 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("暂无数据");
  });

  it("should return error for invalid type", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfEtfRankTool();
    const result = await tool.execute("test-id", { type: 99 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("榜单类型必须是以下之一");
  });

  it("should pass optional params to API", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: [
            {
              code: "510050",
              name: "50ETF",
              ext_name: "华夏上证50ETF",
              exchange: 101,
              roc: 1.2,
              fiveRoc: 2.3,
              volume: 100000,
              cashFlow: 5000,
              turnover_rate: 3.5,
              fundSize: 5000000000,
              trackIndexName: "上证50",
              continueRiseDay: 2,
              premium: -0.05,
            },
          ],
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createGfEtfRankTool();
    await tool.execute("test-id", {
      type: 4,
      page: 1,
      size: 5,
      sameIndexFilter: 1,
      continueRiseLimit: 3,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.args).toMatchObject({
      type: 4,
      page: 1,
      size: 5,
      sameIndexFilter: 1,
      continueRiseLimit: 3,
    });
  });
});
