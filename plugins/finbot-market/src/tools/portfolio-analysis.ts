import { ToolContext, ToolResult } from "../types";

interface Holding {
  symbol: string;
  weight: number;
  cost?: number;
}

interface PortfolioAnalysisArgs {
  holdings: Holding[];
}

export async function portfolioAnalysis(
  args: PortfolioAnalysisArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { holdings } = args;

  if (!holdings || holdings.length === 0) {
    return { content: "持仓为空，请先添加投资标的。" };
  }

  // 校验权重总和
  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0);
  const normalized = Math.abs(totalWeight - 1.0) < 0.01;

  // 集中度分析
  const topHolding = holdings.reduce((max, h) => h.weight > max.weight ? h : max);
  const top3Concentration = holdings
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .reduce((sum, h) => sum + h.weight, 0);

  // 风险评估
  let riskLevel = "低";
  if (topHolding.weight > 0.4) riskLevel = "高（单一标的过度集中）";
  else if (top3Concentration > 0.7) riskLevel = "中高（前三大持仓占比过高）";
  else if (holdings.length < 3) riskLevel = "中（持仓数量不足）";

  // 生成建议
  const suggestions: string[] = [];
  if (topHolding.weight > 0.35) {
    suggestions.push(`- ${topHolding.symbol} 占比 ${(topHolding.weight * 100).toFixed(1)}%，建议减仓至 30% 以下`);
  }
  if (holdings.length < 5) {
    suggestions.push(`- 当前仅 ${holdings.length} 只标的，建议分散至 5-8 只以降低非系统性风险`);
  }
  if (!normalized) {
    suggestions.push(`- 权重总和为 ${(totalWeight * 100).toFixed(1)}%，建议归一化至 100%`);
  }

  const lines = [
    "## 📈 投资组合分析",
    "",
    `**标的数量**: ${holdings.length}`,
    `**前三大集中度**: ${(top3Concentration * 100).toFixed(1)}%`,
    `**最大单一持仓**: ${topHolding.symbol} (${(topHolding.weight * 100).toFixed(1)}%)`,
    `**风险等级**: ${riskLevel}`,
    "",
    "### 持仓明细",
    "",
    "| 标的 | 权重 | 成本 |",
    "|------|------|------|",
    ...holdings
      .sort((a, b) => b.weight - a.weight)
      .map(h => `| ${h.symbol} | ${(h.weight * 100).toFixed(1)}% | ${h.cost ?? "-"} |`),
    "",
  ];

  if (suggestions.length > 0) {
    lines.push("### 💡 建议", "", ...suggestions, "");
  }

  lines.push("⚠️ 不构成投资建议");

  return { content: lines.join("\n") };
}
