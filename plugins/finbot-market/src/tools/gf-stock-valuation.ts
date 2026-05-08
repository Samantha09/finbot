import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const GfStockValuationSchema = {
  type: "object" as const,
  properties: {
    stock_codes: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "股票代码列表，如 SZ000776、SH600000",
    },
  },
  required: ["stock_codes"],
};

interface GfValuationItem {
  stock_code?: string;
  stock_name?: string;
  basic?: {
    list_date?: string;
    total_marketcap?: number | string;
  };
  valuation?: {
    pettm?: number | string;
    pettm_avg?: number | string;
    pettm_percent?: number | string;
    pb?: number | string;
    pb_avg?: number | string;
    pb_percent?: number | string;
  };
}

interface GfValuationResponse {
  data?: {
    data?: GfValuationItem[];
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

function formatValuationList(items: GfValuationItem[]): string {
  const lines: string[] = [];
  lines.push("**股票市值与估值对比**");
  lines.push("");
  lines.push("| 代码 | 名称 | 总市值(亿) | PE(TTM) | PE行业均值 | PE百分位 | PB | PB行业均值 | PB百分位 |");
  lines.push("|------|------|------------|---------|------------|----------|-----|------------|----------|");

  for (const item of items) {
    const code = item.stock_code || "N/A";
    const name = item.stock_name || "N/A";
    const cap = formatNumber(item.basic?.total_marketcap, " 亿");
    const pe = formatNumber(item.valuation?.pettm);
    const peAvg = formatNumber(item.valuation?.pettm_avg);
    const pePct = formatPercent(item.valuation?.pettm_percent);
    const pb = formatNumber(item.valuation?.pb);
    const pbAvg = formatNumber(item.valuation?.pb_avg);
    const pbPct = formatPercent(item.valuation?.pb_percent);
    lines.push(`| ${code} | ${name} | ${cap} | ${pe} | ${peAvg} | ${pePct} | ${pb} | ${pbAvg} | ${pbPct} |`);
  }

  lines.push("");
  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export async function fetchGfStockValuation(
  args: Record<string, unknown>,
): Promise<GfValuationResponse> {
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
      tool_name: "common_basic_post",
      args,
    }),
  });

  const data = (await response.json()) as GfValuationResponse;
  return data;
}

export function createGfStockValuationTool(): AnyAgentTool {
  return {
    name: "gfStockValuation",
    label: "广发股票市值与估值对比",
    description: "对比多只股票的总市值、PE、PB、行业均值及历史百分位等估值信息。",
    parameters: GfStockValuationSchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const rawCodes = Array.isArray(p.stock_codes) ? p.stock_codes : [];
        const stock_codes = rawCodes.map((c) => normalizeStockCode(String(c))).filter((c) => /^[A-Z]{2}\d{6}$/.test(c));

        if (stock_codes.length === 0) {
          return toToolResult({
            content: "请提供至少一个有效的股票代码（如 SZ000776 或 000776）",
            isError: true,
          });
        }

        const response = await fetchGfStockValuation({ stock_codes });

        const items = response.data?.data;
        if (!items) {
          return toToolResult({
            content: "查询失败: 接口返回异常",
            isError: true,
          });
        }
        if (items.length === 0) {
          return toToolResult({
            content: "未查询到估值数据，请检查股票代码是否正确。",
            isError: false,
          });
        }

        const formatted = formatValuationList(items);
        return toToolResult({ content: formatted });
      } catch (error) {
        return toToolResult({
          content: `股票估值查询失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
