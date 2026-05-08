import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const GfEtfSuperFundSchema = {
  type: "object" as const,
  properties: {
    type: {
      type: "string" as const,
      description: "异动类型：大幅流入、大幅流出、持续流入、持续流出",
    },
  },
  required: ["type"],
};

interface GfEtfSuperFundItem {
  etfcode: string;
  etfname: string;
  mktCd: string;
  tradeDate: string;
  fndNet: number;
  fndNetPercent: number;
  estimatedFundingCost: number;
  capitalProfitMargin: number;
  details: Array<{
    tradeDate: string;
    fndNetIn: number;
  }>;
}

interface GfSuperFundApiResponse {
  data?: {
    data?: GfEtfSuperFundItem[];
  };
}

function formatNumber(value: number | undefined, unit = ""): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(2)}${unit}`;
}

function formatEtfSuperFundList(items: GfEtfSuperFundItem[]): string {
  const lines: string[] = [];
  lines.push(`找到 ${items.length} 只发生超级资金异动的 ETF：`);
  lines.push("");

  for (const item of items) {
    const code = item.etfcode || "N/A";
    const name = item.etfname || "N/A";
    const mkt = item.mktCd || "N/A";
    const date = item.tradeDate || "N/A";
    const net = formatNumber(item.fndNet, " 万元");
    const percent = formatNumber(item.fndNetPercent, "%");
    const cost = formatNumber(item.estimatedFundingCost);
    const margin = formatNumber(item.capitalProfitMargin);

    lines.push(`**${code} | ${name}（${mkt}）**`);
    lines.push(`- 交易日期: ${date}`);
    lines.push(`- 资金净流入: ${net}`);
    lines.push(`- 资金强度: ${percent}`);
    lines.push(`- 估算成本: ${cost}`);
    lines.push(`- 盈利水平: ${margin}`);

    if (item.details && item.details.length > 0) {
      lines.push("- 近14日资金明细:");
      const detailLines = item.details.map(
        (d) => `  - ${d.tradeDate}: ${formatNumber(d.fndNetIn, " 万元")}`,
      );
      lines.push(...detailLines);
    }

    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export async function fetchGfEtfSuperFund(
  args: Record<string, unknown>,
): Promise<GfSuperFundApiResponse> {
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
      service_name: "etf-super-fund",
      tool_name: "gfmiddle_eits_super_fund_etf_superfund_get",
      args,
    }),
  });

  const data = (await response.json()) as GfSuperFundApiResponse;
  return data;
}

export function createGfEtfSuperFundTool(): AnyAgentTool {
  return {
    name: "gfEtfSuperFund",
    label: "广发 ETF 超级资金异动",
    description:
      "查询发生大幅流入、大幅流出、持续流入、持续流出等超级资金异动的 ETF 列表及近 14 日资金明细。",
    parameters: GfEtfSuperFundSchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const type = String(p.type || "").trim();
        const validTypes = ["大幅流入", "大幅流出", "持续流入", "持续流出"];
        if (!validTypes.includes(type)) {
          return toToolResult({
            content: `异动类型必须是以下之一：${validTypes.join("、")}`,
            isError: true,
          });
        }

        const response = await fetchGfEtfSuperFund({ type });

        const items = response.data?.data;
        if (!items) {
          return toToolResult({
            content: "查询失败: 接口返回异常",
            isError: true,
          });
        }
        if (items.length === 0) {
          return toToolResult({
            content: `当前交易日不存在「${type}」类型的异动 ETF。`,
            isError: false,
          });
        }

        const formatted = formatEtfSuperFundList(items);
        return toToolResult({ content: formatted });
      } catch (error) {
        return toToolResult({
          content: `ETF 超级资金异动查询失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
