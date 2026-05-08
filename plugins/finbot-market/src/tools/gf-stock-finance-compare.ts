import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const GfStockFinanceCompareSchema = {
  type: "object" as const,
  properties: {
    report_type: {
      type: "integer" as const,
      description: "报告期类型：1=一季报 6=中报 9=三季报 12=年报",
    },
    stock_codes: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "股票代码列表，如 SZ000776、SH600000",
    },
    year: {
      type: "string" as const,
      description: "报告年份，如 2025",
    },
  },
  required: ["report_type", "stock_codes", "year"],
};

interface GfFinanceItem {
  stock_code?: string;
  stock_name?: string;
  end_date?: string;
  roe?: number | string;
  net_profit2totalincome?: number | string;
  cashflow_oper2income?: number | string;
  net_cashflow_oper2net_profit?: number | string;
  equity2asset?: number | string;
  liablity2asset?: number | string;
  liab2equity?: number | string;
  operate_income_yoy?: number | string;
  net_profit_yoy?: number | string;
  total_asset_yoy?: number | string;
}

interface GfFinanceCompareResponse {
  data?: {
    data?: {
      year?: string;
      report_type?: number;
      data?: GfFinanceItem[];
    };
  };
}

function inferMarket(code: string): string {
  if (/^SH\d{6}$/i.test(code) || /^\d{6}$/.test(code) && code.startsWith("6")) return "SH";
  if (/^SZ\d{6}$/i.test(code) || /^\d{6}$/.test(code)) return "SZ";
  return "";
}

function normalizeStockCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (/^[A-Z]{2}\d{6}$/.test(c)) return c;
  if (/^\d{6}$/.test(c)) {
    const mkt = inferMarket(c);
    return mkt ? `${mkt}${c}` : c;
  }
  return c;
}

function toNum(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function formatPercent(value: unknown): string {
  const n = toNum(value);
  if (n === undefined) return "N/A";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatNumber(value: unknown, unit = ""): string {
  const n = toNum(value);
  if (n === undefined) return "N/A";
  return `${n.toFixed(2)}${unit}`;
}

function getReportTypeLabel(type: number): string {
  const map: Record<number, string> = { 1: "一季报", 6: "中报", 9: "三季报", 12: "年报" };
  return map[type] || `类型${type}`;
}

function formatFinanceCompare(result: { year?: string; report_type?: number; data?: GfFinanceItem[] }): string {
  const lines: string[] = [];
  const label = getReportTypeLabel(result.report_type || 0);
  lines.push(`**财务指标对比（${result.year || "N/A"}年 ${label}）**`);
  lines.push("");

  const items = result.data || [];
  if (items.length === 0) {
    lines.push("暂无数据");
    return lines.join("\n");
  }

  for (const item of items) {
    const code = item.stock_code || "N/A";
    const name = item.stock_name || "N/A";
    lines.push(`**${code} | ${name}**`);
    if (item.end_date) lines.push(`- 财报截止: ${item.end_date}`);
    lines.push(`- ROE: ${formatPercent(item.roe)}`);
    lines.push(`- 营业净利率: ${formatPercent(item.net_profit2totalincome)}`);
    lines.push(`- 收现比: ${formatNumber(item.cashflow_oper2income)}`);
    lines.push(`- 净现比: ${formatNumber(item.net_cashflow_oper2net_profit)}`);
    lines.push(`- 股东权益/总资产: ${formatPercent(item.equity2asset)}`);
    lines.push(`- 资产负债率: ${formatPercent(item.liablity2asset)}`);
    lines.push(`- 产权比率: ${formatNumber(item.liab2equity)}`);
    lines.push(`- 营收同比: ${formatPercent(item.operate_income_yoy)}`);
    lines.push(`- 净利润同比: ${formatPercent(item.net_profit_yoy)}`);
    lines.push(`- 总资产增长率: ${formatPercent(item.total_asset_yoy)}`);
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export async function fetchGfStockFinanceCompare(
  args: Record<string, unknown>,
): Promise<GfFinanceCompareResponse> {
  const apiKey = process.env.GF_SKILLS_APIKEY;
  if (!apiKey) {
    throw new Error("GF_SKILLS_APIKEY not configured");
  }

  const response = await fetch("https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      service_name: "quant",
      tool_name: "compare_indicator_post",
      args,
    }),
  });

  const data = (await response.json()) as GfFinanceCompareResponse;
  return data;
}

export function createGfStockFinanceCompareTool(): AnyAgentTool {
  return {
    name: "gfStockFinanceCompare",
    label: "广发股票财务指标对比",
    description:
      "对比两只股票在盈利能力、资本结构、现金流、成长性等维度的核心财务指标。",
    parameters: GfStockFinanceCompareSchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const report_type = Number(p.report_type);
        const validTypes = [1, 6, 9, 12];
        if (!validTypes.includes(report_type)) {
          return toToolResult({
            content: `报告期类型必须是以下之一：${validTypes.join("、")}`,
            isError: true,
          });
        }

        const year = String(p.year || "").trim();
        if (!/^\d{4}$/.test(year)) {
          return toToolResult({
            content: "请提供有效的报告年份（如 2025）",
            isError: true,
          });
        }

        const rawCodes = Array.isArray(p.stock_codes) ? p.stock_codes : [];
        const stock_codes = rawCodes
          .map((c) => normalizeStockCode(String(c)))
          .filter((c) => /^[A-Z]{2}\d{6}$/.test(c));

        if (stock_codes.length === 0) {
          return toToolResult({
            content: "请提供至少一个有效的股票代码（如 SZ000776 或 000776）",
            isError: true,
          });
        }

        const response = await fetchGfStockFinanceCompare({ report_type, stock_codes, year });

        const result = response.data?.data;
        if (!result) {
          return toToolResult({
            content: "查询失败: 接口返回异常",
            isError: true,
          });
        }
        if (!result.data || result.data.length === 0) {
          return toToolResult({
            content: "未查询到财务数据，请检查股票代码和报告期是否正确。",
            isError: false,
          });
        }

        const formatted = formatFinanceCompare(result);
        return toToolResult({ content: formatted });
      } catch (error) {
        return toToolResult({
          content: `财务对比查询失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
