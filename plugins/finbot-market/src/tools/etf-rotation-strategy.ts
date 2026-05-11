import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import { fetchGfEtfList } from "./gf-etf-search.js";

const EtfRotationStrategySchema = {
  type: "object" as const,
  properties: {
    symbols: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "ETF 代码列表，如 [\"510050.SH\", \"159915.SZ\"]",
    },
    period: {
      type: "string" as const,
      enum: ["short", "medium", "long"],
      description: "轮动周期: short=短线(1月权重高), medium=中线(3月权重高), long=长线(6月权重高)",
    },
    maxResults: {
      type: "number" as const,
      description: "最大返回结果数，默认全部",
    },
  },
  required: ["symbols", "period"],
};

type Period = "short" | "medium" | "long";

interface MomentumData {
  roc1m: number;
  roc3m: number;
  roc6m: number;
}

interface FundData {
  netMainForce5d: number;
  netMainForce10d: number;
}

interface ValuationData {
  pePercent: number;
  pbPercent: number;
}

interface QualityData {
  assetScale: number;
  sharpRatio1y: number;
  sharpRatio3y: number;
}

interface EtfScoreItem {
  code: string;
  name: string;
  momentumScore: number;
  fundScore: number;
  valuationScore: number;
  qualityScore: number;
  totalScore: number;
  advice: string;
  indexTempType: string;
}

export function calculateMomentumScore(data: MomentumData, period: Period): number {
  let raw: number;
  if (period === "short") {
    raw = data.roc1m * 0.5 + data.roc3m * 0.3 + data.roc6m * 0.2;
  } else if (period === "medium") {
    raw = data.roc3m * 0.5 + data.roc6m * 0.3 + data.roc1m * 0.2;
  } else {
    raw = data.roc6m * 0.5 + data.roc3m * 0.3 + data.roc1m * 0.2;
  }
  const score = (raw + 20) * 2.5;
  if (score > 100) return 100;
  if (score < 0) return 0;
  return +score.toFixed(2);
}

export function calculateFundScore(data: FundData): number {
  const avg = (data.netMainForce5d + data.netMainForce10d) / 2;
  const score = (avg / 5000) * 50 + 50;
  if (score > 100) return 100;
  if (score < 0) return 0;
  return +score.toFixed(2);
}

export function calculateValuationScore(data: ValuationData): number {
  const avg = (data.pePercent + data.pbPercent) / 2;
  const floored = avg < 5 ? 5 : avg;
  const score = 100 - floored;
  if (score > 100) return 100;
  if (score < 0) return 0;
  return +score.toFixed(2);
}

export function calculateQualityScore(data: QualityData): number {
  let score = 50;
  if (data.assetScale > 1e9) score += 10;
  if (data.sharpRatio1y > 1) score += 10;
  if (data.sharpRatio3y > 1) score += 5;
  if (score > 100) return 100;
  return +score.toFixed(2);
}

export function getAdvice(totalScore: number): string {
  if (totalScore >= 75) return "增持";
  if (totalScore >= 60) return "持有";
  if (totalScore >= 45) return "减持";
  return "观望";
}

function getWeights(period: Period): [number, number, number, number] {
  if (period === "short") return [0.40, 0.30, 0.15, 0.15];
  if (period === "medium") return [0.35, 0.25, 0.25, 0.15];
  return [0.25, 0.20, 0.35, 0.20];
}

function parseSymbol(symbol: string): { tradeCode: string; exchange: string } | null {
  const match = symbol.match(/^(\d{6})\.(SH|SZ|BJ)$/i);
  if (!match) return null;
  return { tradeCode: match[1], exchange: match[2].toUpperCase() };
}

function scoreEtf(item: Record<string, unknown>, period: Period): EtfScoreItem {
  const code = String(item.tradeCode ?? "N/A");
  const name = String(item.secuAbbr ?? item.extName ?? "N/A");
  const indexTempType = String(item.indexTempType ?? "N/A");

  const safeNum = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isNaN(n) ? 0 : n;
  };

  const isAllMissing = (...keys: string[]): boolean =>
    keys.every((k) => item[k] === undefined || item[k] === null);

  const momentumScore = isAllMissing("roc1m", "roc3m", "roc6m")
    ? 50
    : calculateMomentumScore(
        {
          roc1m: safeNum(item.roc1m),
          roc3m: safeNum(item.roc3m),
          roc6m: safeNum(item.roc6m),
        },
        period
      );

  const fundScore = isAllMissing("netMainForce5d", "netMainForce10d")
    ? 50
    : calculateFundScore({
        netMainForce5d: safeNum(item.netMainForce5d),
        netMainForce10d: safeNum(item.netMainForce10d),
      });

  const valuationScore = isAllMissing("pePercent", "pbPercent")
    ? 50
    : calculateValuationScore({
        pePercent: safeNum(item.pePercent),
        pbPercent: safeNum(item.pbPercent),
      });

  const qualityScore = isAllMissing("assetScale", "sharpRatio1y", "sharpRatio3y")
    ? 50
    : calculateQualityScore({
        assetScale: safeNum(item.assetScale),
        sharpRatio1y: safeNum(item.sharpRatio1y),
        sharpRatio3y: safeNum(item.sharpRatio3y),
      });

  const weights = getWeights(period);
  const totalScore = +(
    momentumScore * weights[0] +
    fundScore * weights[1] +
    valuationScore * weights[2] +
    qualityScore * weights[3]
  ).toFixed(2);

  return {
    code,
    name,
    momentumScore,
    fundScore,
    valuationScore,
    qualityScore,
    totalScore,
    advice: getAdvice(totalScore),
    indexTempType,
  };
}

export function createEtfRotationStrategyTool(): AnyAgentTool {
  return {
    name: "etfRotationStrategy",
    label: "ETF 轮动策略",
    description:
      "基于动量、资金流向、估值和质量四个维度，对指定 ETF 列表进行评分排序，输出轮动建议。支持短线/中线/长线三种周期权重配置。",
    parameters: EtfRotationStrategySchema,
    execute: async (_toolCallId, params) => {
      try {
        const symbols = params.symbols as string[];
        const period = params.period as Period;
        const maxResults = typeof params.maxResults === "number" ? params.maxResults : undefined;

        if (!["short", "medium", "long"].includes(period)) {
          return toToolResult({
            content: "无效的周期参数，请选择 short、medium 或 long",
            isError: true,
          });
        }

        if (!Array.isArray(symbols) || symbols.length === 0) {
          return toToolResult({
            content: "请至少提供一个 ETF 代码",
            isError: true,
          });
        }

        const validSymbols: string[] = [];
        for (const sym of symbols) {
          const parsed = parseSymbol(sym);
          if (parsed) {
            validSymbols.push(parsed.tradeCode);
          }
        }

        if (validSymbols.length === 0) {
          return toToolResult({
            content: "所有提供的代码格式均无效，请使用如 510050.SH 的格式",
            isError: true,
          });
        }

        const scoredItems: EtfScoreItem[] = [];
        for (const tradeCode of validSymbols) {
          try {
            const response = await fetchGfEtfList({ tradeCode });
            const fundList = response.data?.data?.fundList;
            if (!fundList || fundList.length === 0) {
              continue;
            }
            for (const item of fundList) {
              const itemCode = String((item as Record<string, unknown>).tradeCode ?? "");
              if (itemCode === tradeCode) {
                const scored = scoreEtf(item as Record<string, unknown>, period);
                scoredItems.push(scored);
                break;
              }
            }
          } catch {
            continue;
          }
        }

        if (scoredItems.length === 0) {
          return toToolResult({
            content: "未能获取任何有效 ETF 数据，请检查代码是否正确",
            isError: true,
          });
        }

        scoredItems.sort((a, b) => b.totalScore - a.totalScore);

        const results = maxResults !== undefined ? scoredItems.slice(0, maxResults) : scoredItems;

        const lines: string[] = [];
        lines.push(`## ETF 轮动策略评分结果（周期: ${period}）`);
        lines.push("");
        lines.push("| 排名 | 代码 | 名称 | 综合得分 | 动量 | 资金 | 估值 | 质量 | 建议 | 温度 |");
        lines.push("|------|------|------|----------|------|------|------|------|------|------|");

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          lines.push(
            [
              `| ${i + 1}`,
              r.code,
              r.name,
              `${r.totalScore.toFixed(2)}`,
              `${r.momentumScore.toFixed(2)}`,
              `${r.fundScore.toFixed(2)}`,
              `${r.valuationScore.toFixed(2)}`,
              `${r.qualityScore.toFixed(2)}`,
              r.advice,
              `${r.indexTempType} |`,
            ].join(" | ")
          );
        }

        lines.push("");
        lines.push("### 详细分析");
        lines.push("");

        for (const r of results) {
          lines.push(`- **${r.code} ${r.name}**：综合得分 ${r.totalScore.toFixed(2)}，建议「${r.advice}」`);
          lines.push(`  - 动量得分 ${r.momentumScore.toFixed(2)}，资金得分 ${r.fundScore.toFixed(2)}，估值得分 ${r.valuationScore.toFixed(2)}，质量得分 ${r.qualityScore.toFixed(2)}`);
        }

        lines.push("");
        lines.push("⚠️ 不构成投资建议");

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `ETF 轮动策略执行失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
