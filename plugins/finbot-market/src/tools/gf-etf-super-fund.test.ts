import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGfEtfSuperFund, createGfEtfSuperFundTool } from "./gf-etf-super-fund.js";

describe("gfEtfSuperFund", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when GF_SKILLS_APIKEY is missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "");
    await expect(fetchGfEtfSuperFund({ type: "大幅流入" })).rejects.toThrow(
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
              etfcode: "510050",
              etfname: "50ETF",
              mktCd: "SH",
              tradeDate: "2026-05-07",
              fndNet: 12345.67,
              fndNetPercent: 5.23,
              estimatedFundingCost: 2.5,
              capitalProfitMargin: 1.8,
              details: [
                { tradeDate: "2026-05-07", fndNetIn: 12345.67 },
                { tradeDate: "2026-05-06", fndNetIn: -2000.0 },
              ],
            },
          ],
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchGfEtfSuperFund({ type: "大幅流入" });
    expect(result.data?.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: expect.stringContaining("etf-super-fund"),
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

    const tool = createGfEtfSuperFundTool();
    const result = await tool.execute("test-id", { type: "大幅流入" });
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

    const tool = createGfEtfSuperFundTool();
    const result = await tool.execute("test-id", { type: "大幅流入" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(false);
    expect(parsed.text).toContain("不存在");
  });

  it("should return error for invalid type", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfEtfSuperFundTool();
    const result = await tool.execute("test-id", { type: "暴涨" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("异动类型必须是以下之一");
  });
});
