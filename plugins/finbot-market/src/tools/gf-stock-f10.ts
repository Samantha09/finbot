import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const GfStockF10Schema = {
  type: "object" as const,
  properties: {
    code: {
      type: "string" as const,
      description: "证券代码（纯数字），如 000776",
    },
    market: {
      type: "string" as const,
      description: "市场（大写）：SH=上海，SZ=深圳",
    },
  },
  required: ["code", "market"],
};

interface GfStockF10Item {
  compName?: string;
  boardName?: string;
  listDate?: string;
  businessScope?: string;
  industries?: string;
}

interface GfStockF10Response {
  data?: {
    data?: GfStockF10Item;
  };
}

function formatStockF10(data: GfStockF10Item): string {
  const lines: string[] = [];
  lines.push("**个股 F10 基础信息**");
  lines.push("");

  if (data.compName) lines.push(`- 公司全称: ${data.compName}`);
  if (data.boardName) lines.push(`- 板块: ${data.boardName}`);
  if (data.listDate) lines.push(`- 上市日期: ${data.listDate}`);
  if (data.industries) lines.push(`- 所属行业: ${data.industries}`);
  if (data.businessScope) {
    lines.push("- 主营业务:");
    lines.push(`  ${data.businessScope}`);
  }

  lines.push("");
  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export async function fetchGfStockF10(
  args: Record<string, unknown>,
): Promise<GfStockF10Response> {
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
      service_name: "wechat_f10",
      tool_name: "f10_basic_post",
      args,
    }),
  });

  const data = (await response.json()) as GfStockF10Response;
  return data;
}

export function createGfStockF10Tool(): AnyAgentTool {
  return {
    name: "gfStockF10",
    label: "广发股票 F10 基础信息",
    description: "查询个股 F10 基础信息，包括公司全称、板块、上市日期、主营业务和所属行业。",
    parameters: GfStockF10Schema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const code = String(p.code || "").trim();
        const market = String(p.market || "").trim().toUpperCase();

        if (!/^\d+$/.test(code)) {
          return toToolResult({
            content: "证券代码必须是纯数字",
            isError: true,
          });
        }

        if (market !== "SH" && market !== "SZ") {
          return toToolResult({
            content: "市场参数必须是 SH 或 SZ",
            isError: true,
          });
        }

        const response = await fetchGfStockF10({ code, market });

        const item = response.data?.data;
        if (!item) {
          return toToolResult({
            content: "查询失败: 接口返回异常或该股票不存在",
            isError: true,
          });
        }

        const formatted = formatStockF10(item);
        return toToolResult({ content: formatted });
      } catch (error) {
        return toToolResult({
          content: `F10 查询失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
