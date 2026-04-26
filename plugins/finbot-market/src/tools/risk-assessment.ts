import { ToolContext, ToolResult } from "../types";

interface RiskAssessmentArgs {
  symbol: string;
  positionSize?: number;
}

interface RiskProfile {
  level: string;
  score: number;
  factors: string[];
}

export async function riskAssessment(
  args: RiskAssessmentArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { symbol, positionSize = 0.1 } = args;

  // 基于标的特征进行简化风险评估
  // 实际生产环境应接入波动率、Beta、历史回撤等数据
  const profile = assessRisk(symbol, positionSize);

  const riskEmoji = profile.score >= 7 ? "🔴" : profile.score >= 4 ? "🟡" : "🟢";

  const lines = [
    `${riskEmoji} ${symbol} 风险评估`,
    "",
    `**风险等级**: ${profile.level} (${profile.score}/10)`,
    "",
    "**风险因素**:",
    ...profile.factors.map(f => `- ${f}`),
    "",
    `**仓位建议**: 当前建议仓位 ≤ ${suggestMaxPosition(profile.score)}%`,
    ``,
    "⚠️ 不构成投资建议",
  ];

  return { content: lines.join("\n") };
}

function assessRisk(symbol: string, positionSize: number): RiskProfile {
  const factors: string[] = [];
  let score = 5;

  // 市场类型判断
  if (symbol.includes("-USD") || symbol.includes("-USDT")) {
    score += 3;
    factors.push("加密货币：高波动性资产，价格日内波动可达 10%+");
  } else if (symbol.endsWith(".HK")) {
    score += 1;
    factors.push("港股：受地缘政治和汇率波动影响较大");
  } else if (/\d{6}\.(SZ|SH)/.test(symbol)) {
    score += 0;
    factors.push("A股：涨跌停限制提供一定保护，但板块轮动风险存在");
  } else {
    score += 1;
    factors.push("美股：汇率风险（USD/CNY）需关注");
  }

  // 仓位集中度
  if (positionSize > 0.3) {
    score += 2;
    factors.push(`高仓位 (${(positionSize * 100).toFixed(0)}%)：单一标的占投资组合比例过高`);
  } else if (positionSize > 0.15) {
    score += 1;
    factors.push(`中等仓位 (${(positionSize * 100).toFixed(0)}%)：建议设置止损位`);
  }

  // 限制在 1-10 范围内
  score = Math.max(1, Math.min(10, score));

  const level = score >= 8 ? "极高" : score >= 6 ? "高" : score >= 4 ? "中等" : "低";

  return { level, score, factors };
}

function suggestMaxPosition(riskScore: number): number {
  if (riskScore >= 8) return 5;
  if (riskScore >= 6) return 10;
  if (riskScore >= 4) return 20;
  return 30;
}
