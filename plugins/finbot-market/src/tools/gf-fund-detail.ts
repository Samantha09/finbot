import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const GfFundDetailSchema = {
  type: "object" as const,
  properties: {
    tradeCode: {
      type: "string" as const,
      description: "基金交易代码，如 519002",
    },
  },
  required: ["tradeCode"],
};

interface GfFundDetailExtraInfo {
  investTarget?: string;
  riskReturnFeature?: string;
}

interface GfFundDetailItem {
  tradeCode?: string;
  chiName?: string;
  secuAbbr?: string;
  fundType?: string;
  riskLevel?: string;
  shareNav?: number | string;
  return1w?: number | string;
  return1m?: number | string;
  return3m?: number | string;
  return6m?: number | string;
  return1y?: number | string;
  return3y?: number | string;
  returnTn?: number | string;
  assetScale?: number | string;
  fundManageCorp?: string;
  contractEffDate?: string;
  prodStatus?: string;
  isAllowBuy?: string;
  isAllowRedeem?: string;
  min_share?: number | string;
  min_share2?: number | string;
  extraInfo?: GfFundDetailExtraInfo;
  report?: string;
}

interface GfFundDetailResponse {
  data?: {
    data?: GfFundDetailItem;
  };
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

function formatFundDetail(data: GfFundDetailItem): string {
  const lines: string[] = [];
  const name = data.chiName || data.secuAbbr || data.tradeCode || "N/A";
  lines.push(`**${name}（${data.tradeCode || "N/A"}）**`);
  lines.push("");

  if (data.fundType) lines.push(`- 基金类型: ${data.fundType}`);
  if (data.riskLevel) lines.push(`- 风险等级: ${data.riskLevel}`);
  if (data.prodStatus) lines.push(`- 基金状态: ${data.prodStatus}`);
  if (data.contractEffDate) lines.push(`- 成立日期: ${data.contractEffDate}`);
  if (data.fundManageCorp) lines.push(`- 管理公司: ${data.fundManageCorp}`);

  const nav = toNum(data.shareNav);
  if (nav !== undefined) lines.push(`- 最新净值: ${nav.toFixed(4)}`);

  const scale = toNum(data.assetScale);
  if (scale !== undefined) lines.push(`- 资产规模: ${(scale / 1e8).toFixed(2)} 亿`);

  lines.push("");
  lines.push("**收益率：**");
  lines.push(`| 近1周 | 近1月 | 近3月 | 近6月 | 近1年 | 近3年 | 成立以来 |`);
  lines.push(`|-------|-------|-------|-------|-------|-------|----------|`);
  lines.push(
    `| ${formatPercent(data.return1w)} | ${formatPercent(data.return1m)} | ${formatPercent(data.return3m)} | ${formatPercent(data.return6m)} | ${formatPercent(data.return1y)} | ${formatPercent(data.return3y)} | ${formatPercent(data.returnTn)} |`,
  );

  lines.push("");
  lines.push("**申赎规则：**");
  lines.push(`- 购买状态: ${data.isAllowBuy === "1" ? "可购买" : data.isAllowBuy === "0" ? "暂停购买" : "N/A"}`);
  lines.push(`- 赎回状态: ${data.isAllowRedeem === "1" ? "可赎回" : data.isAllowRedeem === "0" ? "暂停赎回" : "N/A"}`);
  if (data.min_share != null) lines.push(`- 最低认购: ${formatNumber(data.min_share, " 元")}`);
  if (data.min_share2 != null) lines.push(`- 最低申购: ${formatNumber(data.min_share2, " 元")}`);

  if (data.extraInfo?.investTarget) {
    lines.push("");
    lines.push(`**投资目标：** ${data.extraInfo.investTarget}`);
  }
  if (data.extraInfo?.riskReturnFeature) {
    lines.push(`**风险收益特征：** ${data.extraInfo.riskReturnFeature}`);
  }
  if (data.report) {
    lines.push("");
    lines.push(`**综合评价：** ${data.report}`);
  }

  lines.push("");
  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export async function fetchGfFundDetail(
  args: Record<string, unknown>,
): Promise<GfFundDetailResponse> {
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
      service_name: "jijin_info",
      tool_name: "finance-api_product_fund_detail_get",
      args,
    }),
  });

  const data = (await response.json()) as GfFundDetailResponse;
  return data;
}

export function createGfFundDetailTool(): AnyAgentTool {
  return {
    name: "gfFundDetail",
    label: "广发基金详情",
    description:
      "查询基金完整详情，包括净值、收益率、风险等级、申购赎回规则、基金经理、基金公司及综合评价等信息。",
    parameters: GfFundDetailSchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const tradeCode = String(p.tradeCode || "").trim();

        if (!tradeCode) {
          return toToolResult({
            content: "请提供基金交易代码",
            isError: true,
          });
        }

        const response = await fetchGfFundDetail({ tradeCode });

        const item = response.data?.data;
        if (!item) {
          return toToolResult({
            content: "查询失败: 接口返回异常或该基金不存在",
            isError: true,
          });
        }

        const formatted = formatFundDetail(item);
        return toToolResult({ content: formatted });
      } catch (error) {
        return toToolResult({
          content: `基金详情查询失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
