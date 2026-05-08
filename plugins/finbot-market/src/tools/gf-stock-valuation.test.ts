import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGfStockValuation, createGfStockValuationTool } from "./gf-stock-valuation.js";

describe("gfStockValuation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when GF_SKILLS_APIKEY is missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "");
    await expect(fetchGfStockValuation({ stock_codes: ["SZ000776"] })).rejects.toThrow(
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
              stock_code: "SZ000776",
              stock_name: "广发证券",
              basic: { list_date: "2010-08-06", total_marketcap: 1200.5 },
              valuation: { pettm: 15.3, pettm_avg: 18.2, pettm_percent: 35.6, pb: 1.2, pb_avg: 1.5, pb_percent: 25.0 },
            },
          ],
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchGfStockValuation({ stock_codes: ["SZ000776"] });
    expect(result.data?.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: expect.stringContaining("common_basic_post"),
      }),
    );
  });

  it("should normalize stock codes without prefix", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: [
            {
              stock_code: "SZ000776",
              stock_name: "广发证券",
              basic: { total_marketcap: 1200 },
              valuation: { pettm: "15.3" },
            },
          ],
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createGfStockValuationTool();
    await tool.execute("test-id", { stock_codes: ["000776", "600000"] });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.args.stock_codes).toEqual(["SZ000776", "SH600000"]);
  });

  it("should return error when API returns empty data", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ data: null }),
      }),
    );

    const tool = createGfStockValuationTool();
    const result = await tool.execute("test-id", { stock_codes: ["SZ000776"] });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("接口返回异常");
  });

  it("should return error for empty stock_codes", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfStockValuationTool();
    const result = await tool.execute("test-id", { stock_codes: [] });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("至少一个有效的股票代码");
  });
});
