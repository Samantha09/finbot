import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGfStockFinanceCompare, createGfStockFinanceCompareTool } from "./gf-stock-finance-compare.js";

describe("gfStockFinanceCompare", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should throw when GF_SKILLS_APIKEY is missing", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "");
    await expect(fetchGfStockFinanceCompare({ report_type: 9, stock_codes: ["SZ000776"], year: "2025" })).rejects.toThrow(
      "GF_SKILLS_APIKEY not configured",
    );
  });

  it("should call GF API with correct payload", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            year: "2025",
            report_type: 9,
            data: [
              {
                stock_code: "SZ000783",
                stock_name: "长江证券",
                end_date: "2025-09-30",
                roe: 5.2,
                net_profit2totalincome: 28.5,
                cashflow_oper2income: 0.85,
                net_cashflow_oper2net_profit: 1.12,
                equity2asset: 65.3,
                liablity2asset: 34.7,
                liab2equity: 0.53,
                operate_income_yoy: 12.5,
                net_profit_yoy: 8.3,
                total_asset_yoy: 15.2,
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const result = await fetchGfStockFinanceCompare({ report_type: 9, stock_codes: ["SZ000783"], year: "2025" });
    expect(result.data?.data?.data).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
        body: expect.stringContaining("compare_indicator_post"),
      }),
    );
  });

  it("should normalize stock codes without prefix", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          data: {
            year: "2025",
            report_type: 9,
            data: [
              {
                stock_code: "SZ000776",
                stock_name: "广发证券",
                roe: "6.5",
                net_profit2totalincome: "30.2",
              },
            ],
          },
        },
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const tool = createGfStockFinanceCompareTool();
    await tool.execute("test-id", { report_type: 9, stock_codes: ["000776", "600000"], year: "2025" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.args.stock_codes).toEqual(["SZ000776", "SH600000"]);
    expect(body.args.report_type).toBe(9);
    expect(body.args.year).toBe("2025");
  });

  it("should return error for invalid report_type", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfStockFinanceCompareTool();
    const result = await tool.execute("test-id", { report_type: 3, stock_codes: ["SZ000776"], year: "2025" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("报告期类型必须是以下之一");
  });

  it("should return error for invalid year", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    const tool = createGfStockFinanceCompareTool();
    const result = await tool.execute("test-id", { report_type: 9, stock_codes: ["SZ000776"], year: "25" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("有效的报告年份");
  });

  it("should return error when API returns empty data", async () => {
    vi.stubEnv("GF_SKILLS_APIKEY", "test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ data: null }),
      }),
    );

    const tool = createGfStockFinanceCompareTool();
    const result = await tool.execute("test-id", { report_type: 9, stock_codes: ["SZ000776"], year: "2025" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.isError).toBe(true);
    expect(parsed.text).toContain("接口返回异常");
  });
});
