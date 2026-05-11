import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import { fetchGfEtfList } from "./gf-etf-search.js";

const EtfSmartInvestSchema = {
  type: "object" as const,
  properties: {
    symbol: { type: "string" as const, description: "ETF 代码，如 510050.SH" },
    baseAmount: { type: "number" as const, description: "基础定投金额，默认 1000 元" },
  },
};

export function calculateMultiplier(percent: number): number {
  if (percent <= 10) return 3.0;
  if (percent <= 20) return 2.0;
  if (percent <= 30) return 1.5;
  if (percent <= 50) return 1.0;
  if (percent <= 70) return 0.5;
  if (percent <= 90) return 0.25;
  return 0;
}

export function getValuationLabel(percent: number): string {
  if (percent <= 10) return "极度低估";
  if (percent <= 20) return "低估";
  if (percent <= 30) return "偏低";
  if (percent <= 50) return "正常";
  if (percent <= 70) return "偏高";
  if (percent <= 90) return "高估";
  return "极度高估";
}

function getTempMultiplier(tempType: string | null): number | null {
  if (tempType === "low") return 1.5;
  if (tempType === "ord") return 1.0;
  if (tempType === "high") return 0;
  return null;
}

function getTempLabel(tempType: string | null): string {
  if (tempType === "low") return "低温";
  if (tempType === "ord") return "中温";
  if (tempType === "high") return "高温";
  return "未知";
}

function formatPercentValue(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(1)}%`;
}

function parseSymbol(symbol: string): { code: string; exchange: string } {
  const parts = symbol.split(".");
  return {
    code: parts[0] || symbol,
    exchange: parts[1] || "",
  };
}

interface EtfData {
  tradeCode: string;
  secuAbbr: string;
  pePercent: number | null;
  pbPercent: number | null;
  indexTempType: string | null;
}

export function createEtfSmartInvestTool(): AnyAgentTool {
  return {
    name: "etfSmartInvest",
    label: "ETF 智能定投",
    description: "根据 ETF 估值百分位和指数温度，给出智能定投金额建议。",
    parameters: EtfSmartInvestSchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const symbol = String(p.symbol || "");
        const baseAmount = typeof p.baseAmount === "number" ? p.baseAmount : 1000;

        if (!symbol) {
          return toToolResult({
            content: "请提供 ETF 代码",
            isError: true,
          });
        }

        const { code } = parseSymbol(symbol);
        const response = await fetchGfEtfList({ tradeCode: code, limit: 1 });

        const fundList = response.data?.data?.fundList;
        if (!fundList || fundList.length === 0) {
          return toToolResult({
            content: `未找到 ETF ${symbol} 的数据`,
            isError: true,
          });
        }

        const item = fundList[0] as unknown as EtfData;
        const pePercent = item.pePercent ?? null;
        const pbPercent = item.pbPercent ?? null;
        const indexTempType = item.indexTempType ?? null;

        let compositePercent: number | null = null;
        let multiplier: number | null = null;
        let source = "";

        if (pePercent !== null && pbPercent !== null) {
          compositePercent = +(+(pePercent + pbPercent) / 2).toFixed(2);
          multiplier = calculateMultiplier(compositePercent);
          source = "pe_pb";
        } else if (pePercent !== null) {
          compositePercent = +pePercent.toFixed(2);
          multiplier = calculateMultiplier(compositePercent);
          source = "pe";
        } else if (pbPercent !== null) {
          compositePercent = +pbPercent.toFixed(2);
          multiplier = calculateMultiplier(compositePercent);
          source = "pb";
        } else if (indexTempType !== null) {
          multiplier = getTempMultiplier(indexTempType);
          source = "temp";
        } else {
          return toToolResult({
            content: `${symbol} | ${item.secuAbbr || ""} 缺少估值数据，无法给出定投建议`,
            isError: true,
          });
        }

        const tempMultiplier = getTempMultiplier(indexTempType);
        let conflictWarning = "";
        if (multiplier !== null && tempMultiplier !== null && source !== "temp") {
          if (Math.abs(multiplier - tempMultiplier) >= 1.0) {
            conflictWarning = "数据不一致，请留意";
          }
        }

        const finalMultiplier = multiplier ?? tempMultiplier ?? 1.0;
        const suggestedAmount = Math.round(baseAmount * finalMultiplier);
        const valuationLabel = compositePercent !== null
          ? getValuationLabel(compositePercent)
          : getTempLabel(indexTempType);

        const lines: string[] = [];
        lines.push(`## ${symbol} | ${item.secuAbbr || ""} 智能定投建议`);
        lines.push("");
        lines.push(`**当前估值状态：${valuationLabel}**`);
        lines.push("");
        lines.push("| 指标 | 数值 | 说明 |");
        lines.push("|------|------|------|");
        lines.push(`| PE 百分位 | ${formatPercentValue(pePercent)} | ${pePercent !== null ? getValuationLabel(pePercent) + "区间" : "数据缺失"} |`);
        lines.push(`| PB 百分位 | ${formatPercentValue(pbPercent)} | ${pbPercent !== null ? getValuationLabel(pbPercent) + "区间" : "数据缺失"} |`);
        lines.push(`| 综合估值百分位 | ${compositePercent !== null ? formatPercentValue(compositePercent) : "N/A"} | ${compositePercent !== null ? getValuationLabel(compositePercent) + "区间" : "依据指数温度"} |`);
        lines.push(`| 指数温度 | ${indexTempType ?? "N/A"} | 广发: ${getTempLabel(indexTempType)} |`);
        lines.push("");
        lines.push("**定投建议：**");
        lines.push(`- 基础金额：${baseAmount} 元`);
        lines.push(`- 建议倍数：${finalMultiplier.toFixed(1)}x`);
        lines.push(`- 本次建议投入：${suggestedAmount} 元`);
        lines.push("");

        let strategyLogic = "";
        if (compositePercent !== null) {
          strategyLogic = `综合估值百分位 ${formatPercentValue(compositePercent)}，处于${getValuationLabel(compositePercent)}区间，建议`;
          if (finalMultiplier >= 2.0) {
            strategyLogic += "加倍定投以积累更多低成本份额。";
          } else if (finalMultiplier >= 1.0) {
            strategyLogic += "按基础金额正常定投。";
          } else if (finalMultiplier > 0) {
            strategyLogic += "减少定投金额，控制成本。";
          } else {
            strategyLogic += "暂停定投，等待估值回归。";
          }
        } else {
          strategyLogic = `指数温度为${getTempLabel(indexTempType)}，建议倍数 ${finalMultiplier}x。`;
        }

        lines.push(`**策略逻辑：** ${strategyLogic}`);
        if (conflictWarning) {
          lines.push(`**风险提示：** ${conflictWarning}`);
        }
        lines.push("⚠️ 不构成投资建议");

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `智能定投计算失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
