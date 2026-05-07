import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const GfEtfSearchSchema = {
  type: "object" as const,
  properties: {
    search: { type: "string" as const, description: "模糊搜索 ETF 代码或名称" },
    type: { type: "string" as const, description: "ETF 类型，如 股票ETF、境外ETF" },
    trakType: { type: "string" as const, description: "赛道分类，如 宽基、行业、主题" },
    oneTrakName: { type: "string" as const, description: "一级赛道名称，如 科技" },
    tradeCode: { type: "string" as const, description: "交易代码，多个逗号分隔" },
    tradeT0: { type: "string" as const, description: "是否 T+0，1=是" },
    marginTrade: { type: "string" as const, description: "是否两融，1=是" },
    roc1w: { type: "string" as const, description: "近1周涨跌幅条件，如 5~、0~20" },
    roc1m: { type: "string" as const, description: "近1月涨跌幅条件" },
    roc6m: { type: "string" as const, description: "近6月涨跌幅条件" },
    roc1y: { type: "string" as const, description: "近1年涨跌幅条件" },
    return1m: { type: "string" as const, description: "近1月收益率条件" },
    return6m: { type: "string" as const, description: "近6月收益率条件" },
    return1y: { type: "string" as const, description: "近1年收益率条件" },
    return3y: { type: "string" as const, description: "近3年收益率条件" },
    maxDrawdown1m: { type: "string" as const, description: "近1月最大回撤条件" },
    maxDrawdown1y: { type: "string" as const, description: "近1年最大回撤条件" },
    sharpRatio1y: { type: "string" as const, description: "近1年夏普比率条件" },
    sharpRatio3y: { type: "string" as const, description: "近3年夏普比率条件" },
    valuationResult: { type: "string" as const, description: "估值区，1=低位 2=中位 3=高位" },
    indexTempType: { type: "string" as const, description: "指数温度，low/ord/high" },
    assetScale: { type: "string" as const, description: "基金规模区间" },
    start: { type: "number" as const, description: "分页起始位置，默认 0" },
    limit: { type: "number" as const, description: "结果数量限制，默认 20" },
    sort: { type: "string" as const, description: "排序字段，降序加 - 前缀，如 -roc1m" },
    addRealTimeRoc: { type: "number" as const, description: "是否加入实时涨跌幅，1=是" },
  },
};

interface GfEtfItem {
  tradeCode: string;
  secuAbbr: string;
  extName: string;
  exchangeCode: string;
  fiInfoName: string;
  fiInfoCode: string;
  fundSize: number;
  assetScale: number;
  pe: number;
  pePercent: number;
  pb: number;
  pbPercent: number;
  roc: number;
  roc1w: number;
  roc1m: number;
  roc6m: number;
  roc1y: number;
  netMainForce1d: number;
  netMainForce5d: number;
  premium: number;
  indexTempType: string;
  trakName: string;
  trakType: string;
}

interface GfApiResponse {
  data?: {
    data?: {
      count?: number;
      fundList?: GfEtfItem[];
    };
  };
}

function buildArgs(params: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const allowedKeys = [
    "search", "type", "trakType", "oneTrakName", "tradeCode", "tradeT0", "marginTrade",
    "roc1w", "roc1m", "roc6m", "roc1y",
    "return1m", "return6m", "return1y", "return3y",
    "maxDrawdown1m", "maxDrawdown1y",
    "sharpRatio1y", "sharpRatio3y",
    "valuationResult", "indexTempType", "assetScale",
    "start", "limit", "sort", "addRealTimeRoc",
  ];
  for (const key of allowedKeys) {
    if (params[key] !== undefined && params[key] !== "") {
      args[key] = params[key];
    }
  }
  return args;
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

function formatEtfList(items: GfEtfItem[]): string {
  const lines: string[] = [];
  lines.push("| 代码 | 名称 | 赛道 | 涨跌幅(1月) | 涨跌幅(1年) | PE百分位 | 规模(亿) | 指数温度 |");
  lines.push("|------|------|------|-------------|-------------|----------|----------|----------|");

  for (const item of items) {
    const code = item.tradeCode || "N/A";
    const name = item.secuAbbr || item.extName || "N/A";
    const track = item.trakName || item.trakType || "N/A";
    const roc1m = formatPercent(item.roc1m);
    const roc1y = formatPercent(item.roc1y);
    const pePct = item.pePercent != null ? `${item.pePercent.toFixed(1)}%` : "N/A";
    const scale = item.assetScale != null ? `${(item.assetScale / 1e8).toFixed(2)}` : "N/A";
    const temp = item.indexTempType || "N/A";
    lines.push(`| ${code} | ${name} | ${track} | ${roc1m} | ${roc1y} | ${pePct} | ${scale} | ${temp} |`);
  }

  lines.push("");
  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export async function fetchGfEtfList(args: Record<string, unknown>): Promise<GfApiResponse> {
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
      service_name: "etf_search",
      tool_name: "finance_api_inclusive_etf_list_get",
      args,
    }),
  });

  const data = await response.json() as GfApiResponse;
  return data;
}

export function createGfEtfSearchTool(): AnyAgentTool {
  return {
    name: "gfEtfSearch",
    label: "广发 ETF 筛选",
    description:
      "通过广发证券数据接口按多维度筛选 ETF。支持按收益率、回撤、夏普、估值温度、规模、赛道等条件筛选。",
    parameters: GfEtfSearchSchema,
    execute: async (_toolCallId, params) => {
      try {
        const args = buildArgs(params as Record<string, unknown>);
        if (Object.keys(args).length === 0) {
          return toToolResult({
            content: "请至少提供一个筛选条件（如 trakType、roc1m、valuationResult 等）",
            isError: true,
          });
        }

        const response = await fetchGfEtfList(args);

        const items = response.data?.data?.fundList;
        if (!items) {
          return toToolResult({
            content: "查询失败: 接口返回异常",
            isError: true,
          });
        }
        if (items.length === 0) {
          return toToolResult({
            content: "未找到符合条件的 ETF，请放宽筛选条件后重试。",
            isError: false,
          });
        }

        const formatted = formatEtfList(items);
        return toToolResult({ content: formatted });
      } catch (error) {
        return toToolResult({
          content: `ETF 筛选失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
