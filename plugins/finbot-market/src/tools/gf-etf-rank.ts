import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const GfEtfRankSchema = {
  type: "object" as const,
  properties: {
    type: {
      type: "integer" as const,
      description: "榜单类型：1=涨幅 2=跌幅 3=换手 4=主力资金 12=净申购 13=溢价率",
    },
    page: {
      type: "integer" as const,
      description: "页数，从 0 开始",
    },
    size: {
      type: "integer" as const,
      description: "每页条数，默认 10",
    },
    sameIndexFilter: {
      type: "integer" as const,
      description: "同指数 ETF 只展示 1 只：1=开启 0=关闭",
    },
    continueRiseLimit: {
      type: "integer" as const,
      description: "连涨/连跌天数过滤",
    },
  },
  required: ["type"],
};

interface GfEtfRankItem {
  code: string;
  name: string;
  ext_name: string;
  exchange: number;
  roc: number;
  fiveRoc: number;
  volume: number;
  cashFlow: number;
  turnover_rate: number;
  fundSize: number;
  trackIndexName: string;
  continueRiseDay: number;
  premium: number;
}

interface GfRankApiResponse {
  data?: {
    data?: GfEtfRankItem[];
  };
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatNumber(value: number | undefined, unit = ""): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(2)}${unit}`;
}

function getRankTypeLabel(type: number): string {
  const map: Record<number, string> = {
    1: "涨幅榜",
    2: "跌幅榜",
    3: "换手榜",
    4: "主力资金榜",
    12: "净申购榜",
    13: "溢价率榜",
  };
  return map[type] || `类型${type}`;
}

function getExchangeLabel(exchange: number): string {
  return exchange === 101 ? "SH" : exchange === 105 ? "SZ" : String(exchange);
}

function formatEtfRankList(items: GfEtfRankItem[], type: number): string {
  const label = getRankTypeLabel(type);
  const lines: string[] = [];
  lines.push(`ETF ${label}（共 ${items.length} 只）：`);
  lines.push("");

  for (const item of items) {
    const code = item.code || "N/A";
    const name = item.name || item.ext_name || "N/A";
    const mkt = getExchangeLabel(item.exchange);
    const roc = formatPercent(item.roc);
    const fiveRoc = formatPercent(item.fiveRoc);
    const volume = formatNumber(item.volume, " 万");
    const cashFlow = formatNumber(item.cashFlow, " 万");
    const turnover = formatPercent(item.turnover_rate);
    const scale = item.fundSize != null ? `${(item.fundSize / 1e8).toFixed(2)} 亿` : "N/A";
    const indexName = item.trackIndexName || "N/A";
    const contDay = item.continueRiseDay != null ? `${item.continueRiseDay} 天` : "N/A";
    const premium = formatPercent(item.premium);

    lines.push(`**${code} | ${name}（${mkt}）**`);
    lines.push(`- 当日涨跌幅: ${roc} | 5日涨跌幅: ${fiveRoc}`);
    lines.push(`- 成交额: ${volume} | 主力资金: ${cashFlow}`);
    lines.push(`- 换手率: ${turnover} | 规模: ${scale}`);
    lines.push(`- 跟踪指数: ${indexName} | 连涨/连跌: ${contDay} | 溢价率: ${premium}`);
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export async function fetchGfEtfRank(
  args: Record<string, unknown>,
): Promise<GfRankApiResponse> {
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
      service_name: "etf_rank",
      tool_name: "finance-api_product_etf_rank_get",
      args,
    }),
  });

  const data = (await response.json()) as GfRankApiResponse;
  return data;
}

export function createGfEtfRankTool(): AnyAgentTool {
  return {
    name: "gfEtfRank",
    label: "广发 ETF 榜单",
    description:
      "获取 ETF 涨幅、跌幅、换手、主力资金、净申购、溢价率等多类榜单数据。支持分页和同指数去重。",
    parameters: GfEtfRankSchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const type = Number(p.type);
        const validTypes = [1, 2, 3, 4, 12, 13];
        if (!validTypes.includes(type)) {
          return toToolResult({
            content: `榜单类型必须是以下之一：${validTypes.join("、")}`,
            isError: true,
          });
        }

        const args: Record<string, unknown> = { type };
        if (p.page !== undefined) args.page = Number(p.page);
        if (p.size !== undefined) args.size = Number(p.size);
        if (p.sameIndexFilter !== undefined) args.sameIndexFilter = Number(p.sameIndexFilter);
        if (p.continueRiseLimit !== undefined) args.continueRiseLimit = Number(p.continueRiseLimit);

        const response = await fetchGfEtfRank(args);

        const items = response.data?.data;
        if (!items) {
          return toToolResult({
            content: "查询失败: 接口返回异常",
            isError: true,
          });
        }
        if (items.length === 0) {
          return toToolResult({
            content: "当前榜单暂无数据，请稍后重试。",
            isError: false,
          });
        }

        const formatted = formatEtfRankList(items, type);
        return toToolResult({ content: formatted });
      } catch (error) {
        return toToolResult({
          content: `ETF 榜单查询失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
