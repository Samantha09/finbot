import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const PortfolioAnalysisSchema = {
  type: "object" as const,
  properties: {
    holdings: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          symbol: { type: "string" as const },
          weight: { type: "number" as const },
          cost: { type: "number" as const },
          assetType: { type: "string" as const, enum: ["equity", "fund", "bond", "cash", "reits"], description: "资产类型，默认 equity" },
        },
        required: ["symbol", "weight"],
      },
    },
  },
  required: ["holdings"],
};

export function createPortfolioAnalysisTool(): AnyAgentTool {
  return {
    name: "portfolioAnalysis",
    label: "Portfolio Analysis",
    description: "分析投资组合的集中度、相关性和风险暴露",
    parameters: PortfolioAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { holdings } = params as {
        holdings: Array<{ symbol: string; weight: number; cost?: number; assetType?: string }>;
      };

      if (!holdings || holdings.length === 0) {
        return toToolResult({ content: "持仓为空，请先添加投资标的。" });
      }

      const equityTypes = new Set(["equity", "fund", "reits"]);
      const equityHoldings = holdings.filter((h) => equityTypes.has(h.assetType || "equity"));
      const otherHoldings = holdings.filter((h) => !equityTypes.has(h.assetType || "equity"));

      const totalWeight = equityHoldings.reduce((sum, h) => sum + h.weight, 0);
      const normalized = Math.abs(totalWeight - 1.0) < 0.01;

      let riskLevel = "低";
      let topHolding = equityHoldings[0] ?? { symbol: "-", weight: 0 };
      let top3Concentration = 0;

      if (equityHoldings.length > 0) {
        topHolding = equityHoldings.reduce((max, h) =>
          h.weight > max.weight ? h : max,
        );
        top3Concentration = [...equityHoldings]
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3)
          .reduce((sum, h) => sum + h.weight, 0);

        if (topHolding.weight > 0.4) riskLevel = "高（单一标的过度集中）";
        else if (top3Concentration > 0.7) riskLevel = "中高（前三大持仓占比过高）";
        else if (equityHoldings.length < 3) riskLevel = "中（持仓数量不足）";
      }

      const suggestions: string[] = [];
      if (equityHoldings.length > 0) {
        if (topHolding.weight > 0.35) {
          suggestions.push(
            `- ${topHolding.symbol} 占比 ${(topHolding.weight * 100).toFixed(1)}%，建议减仓至 30% 以下`,
          );
        }
        if (equityHoldings.length < 5) {
          suggestions.push(
            `- 当前仅 ${equityHoldings.length} 只权益类标的，建议分散至 5-8 只以降低非系统性风险`,
          );
        }
        if (!normalized) {
          suggestions.push(
            `- 权益类权重总和为 ${(totalWeight * 100).toFixed(1)}%，建议归一化至 100%`,
          );
        }
      }

      const lines = [
        "## 📈 投资组合分析",
        "",
        `**权益类标的数量**: ${equityHoldings.length}`,
        `**前三大集中度**: ${(top3Concentration * 100).toFixed(1)}%`,
        `**最大单一持仓**: ${topHolding.symbol} (${(topHolding.weight * 100).toFixed(1)}%)`,
        `**风险等级**: ${riskLevel}`,
        "",
        "### 权益类持仓明细",
        "",
        "| 标的 | 权重 | 成本 |",
        "|------|------|------|",
        ...equityHoldings
          .sort((a, b) => b.weight - a.weight)
          .map(
            (h) =>
              `| ${h.symbol} | ${(h.weight * 100).toFixed(1)}% | ${h.cost ?? "-"} |`,
          ),
        "",
      ];

      if (otherHoldings.length > 0) {
        const typeLabels: Record<string, string> = {
          bond: "债券/固收",
          cash: "现金/货币",
        };
        lines.push("### 非权益类持仓", "");
        lines.push("| 标的 | 类型 | 权重 |");
        lines.push("|------|------|------|");
        for (const h of otherHoldings.sort((a, b) => b.weight - a.weight)) {
          lines.push(`| ${h.symbol} | ${typeLabels[h.assetType || "其他"] || "其他"} | ${(h.weight * 100).toFixed(1)}% |`);
        }
        lines.push("");
      }

      if (suggestions.length > 0) {
        lines.push("### 💡 建议", "", ...suggestions, "");
      }

      lines.push("⚠️ 不构成投资建议");

      return toToolResult({ content: lines.join("\n") });
    },
  };
}
