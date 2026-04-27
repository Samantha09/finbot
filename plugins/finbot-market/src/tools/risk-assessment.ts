import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const RiskAssessmentSchema = {
  type: "object" as const,
  properties: {
    symbol: { type: "string" as const },
    positionSize: {
      type: "number" as const,
      description: "仓位占比（0-1）",
    },
  },
  required: ["symbol"],
};

interface RiskProfile {
  level: string;
  score: number;
  factors: string[];
}

function assessRisk(symbol: string, positionSize: number): RiskProfile {
  const factors: string[] = [];
  let score = 5;

  if (symbol.includes("-USD") || symbol.includes("-USDT")) {
    score += 3;
    factors.push("加密货币：高波动性资产，价格日内波动可达 10%+");
  } else if (symbol.endsWith(".HK")) {
    score += 1;
    factors.push("港股：受地缘政治和汇率波动影响较大");
  } else if (/\d{6}\.(SZ|SH)/.test(symbol)) {
    factors.push("A股：涨跌停限制提供一定保护，但板块轮动风险存在");
  } else {
    score += 1;
    factors.push("美股：汇率风险（USD/CNY）需关注");
  }

  if (positionSize > 0.3) {
    score += 2;
    factors.push(
      `高仓位 (${(positionSize * 100).toFixed(0)}%)：单一标的占投资组合比例过高`,
    );
  } else if (positionSize > 0.15) {
    score += 1;
    factors.push(
      `中等仓位 (${(positionSize * 100).toFixed(0)}%)：建议设置止损位`,
    );
  }

  score = Math.max(1, Math.min(10, score));
  const level =
    score >= 8 ? "极高" : score >= 6 ? "高" : score >= 4 ? "中等" : "低";

  return { level, score, factors };
}

function suggestMaxPosition(riskScore: number): number {
  if (riskScore >= 8) return 5;
  if (riskScore >= 6) return 10;
  if (riskScore >= 4) return 20;
  return 30;
}

export function createRiskAssessmentTool(): AnyAgentTool {
  return {
    name: "riskAssessment",
    label: "Risk Assessment",
    description: "评估单只标的或组合的风险等级",
    parameters: RiskAssessmentSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, positionSize = 0.1 } = params as {
        symbol: string;
        positionSize?: number;
      };

      const profile = assessRisk(symbol, positionSize);
      const riskEmoji =
        profile.score >= 7 ? "🔴" : profile.score >= 4 ? "🟡" : "🟢";

      const lines = [
        `${riskEmoji} ${symbol} 风险评估`,
        "",
        `**风险等级**: ${profile.level} (${profile.score}/10)`,
        "",
        "**风险因素**:",
        ...profile.factors.map((f) => `- ${f}`),
        "",
        `**仓位建议**: 当前建议仓位 ≤ ${suggestMaxPosition(profile.score)}%`,
        "",
        "⚠️ 不构成投资建议",
      ];

      return toToolResult({ content: lines.join("\n") });
    },
  };
}
