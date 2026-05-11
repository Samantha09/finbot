import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import { fetchGfEtfList } from "./gf-etf-search.js";

const EtfRotationStrategySchema = {
  type: "object" as const,
  properties: {
    symbols: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "ETF 代码列表，如 [\"510050.SH\", \"159915.SZ\"]。mode=custom 时必填。",
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
    mode: {
      type: "string" as const,
      enum: ["auto", "custom"],
      description: "模式: auto=自动从全市场按主题选基(默认), custom=使用用户提供的 symbols",
    },
  },
  required: ["period"],
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

const THEME_RULES: Array<{ theme: string; keywords: string[] }> = [
  { theme: "港股", keywords: ["港股", "恒生", "H股", "香港", "港", "中概"] },
  { theme: "美股", keywords: ["纳指", "标普", "美国", "道琼斯", "美股", "纳斯达克"] },
  { theme: "宽基", keywords: ["50", "300", "500", "1000", "中证", "沪深", "上证", "深证", "创业板", "科创", "A50", "A100", "A500"] },
  { theme: "科技", keywords: ["科技", "芯片", "半导体", "人工智能", "AI", "TMT", "通信", "5G", "机器人"] },
  { theme: "医药", keywords: ["医药", "医疗", "生物", "健康", "器械", "疫苗"] },
  { theme: "消费", keywords: ["消费", "白酒", "食品", "家电", "饮料", "农业", "畜牧", "养殖", "旅游"] },
  { theme: "新能源", keywords: ["新能源", "光伏", "碳中和", "电池", "储能", "锂电", "智能车", "新能源车", "绿色电力"] },
  { theme: "金融地产", keywords: ["金融", "银行", "地产", "证券", "保险", "基建", "建筑"] },
  { theme: "红利", keywords: ["红利", "股息", "高股息", "低波红利"] },
  { theme: "商品", keywords: ["黄金", "白银", "有色", "豆粕", "能源", "煤炭", "钢铁", "石油", "商品", "矿业", "稀土"] },
];

export function detectTheme(name: string): string {
  const lower = name.toLowerCase();
  for (const rule of THEME_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) return rule.theme;
    }
  }
  return "其他";
}

export function buildAutoPool(fundList: Record<string, unknown>[]): Record<string, unknown>[] {
  const themeMap = new Map<string, Record<string, unknown>>();
  for (const item of fundList) {
    const name = String(item.secuAbbr ?? item.extName ?? "");
    const code = String(item.tradeCode ?? "");
    if (!name || !code) continue;
    const theme = detectTheme(name);
    const scale = typeof item.assetScale === "number" ? item.assetScale : Number(item.assetScale);
    const existing = themeMap.get(theme);
    if (!existing) {
      themeMap.set(theme, item);
    } else {
      const existingScale = typeof existing.assetScale === "number" ? existing.assetScale : Number(existing.assetScale);
      if (!Number.isNaN(scale) && !Number.isNaN(existingScale) && scale > existingScale) {
        themeMap.set(theme, item);
      }
    }
  }
  return Array.from(themeMap.values());
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
        const p = params as Record<string, unknown>;
        const period = p.period as Period;
        const maxResults = typeof p.maxResults === "number" ? p.maxResults : undefined;
        const mode = (p.mode as string) || "auto";

        if (!["short", "medium", "long"].includes(period)) {
          return toToolResult({
            content: "无效的周期参数，请选择 short、medium 或 long",
            isError: true,
          });
        }

        const scoredItems: EtfScoreItem[] = [];

        if (mode === "custom") {
          const symbols = p.symbols as string[];
          if (!Array.isArray(symbols) || symbols.length === 0) {
            return toToolResult({
              content: "custom 模式下请至少提供一个 ETF 代码",
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

          for (const tradeCode of validSymbols) {
            try {
              const response = await fetchGfEtfList({ tradeCode });
              const fundList = response.data?.data?.fundList;
              if (!fundList || fundList.length === 0) {
                continue;
              }
              for (const item of fundList) {
                const raw = item as unknown as Record<string, unknown>;
                const itemCode = String(raw.tradeCode ?? "");
                if (itemCode === tradeCode) {
                  const scored = scoreEtf(raw, period);
                  scoredItems.push(scored);
                  break;
                }
              }
            } catch {
              continue;
            }
          }
        } else {
          try {
            const response = await fetchGfEtfList({ sort: "-assetScale", limit: 100 });
            const fundList = response.data?.data?.fundList;
            if (!fundList || fundList.length === 0) {
              return toToolResult({
                content: "自动选基失败：未能获取全市场 ETF 数据",
                isError: true,
              });
            }
            const pool = buildAutoPool(fundList as unknown as Record<string, unknown>[]);
            if (pool.length === 0) {
              return toToolResult({
                content: "自动选基失败：未能从全市场筛选出有效 ETF",
                isError: true,
              });
            }
            for (const item of pool) {
              const scored = scoreEtf(item, period);
              scoredItems.push(scored);
            }
          } catch (err) {
            return toToolResult({
              content: `自动选基失败: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            });
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

        const periodLabel = period === "short" ? "短线" : period === "medium" ? "中线" : "长线";
        const lines: string[] = [];

        lines.push(`## ETF 主题轮动策略（${periodLabel}）`);
        lines.push("");

        const strong = results.filter((r) => r.totalScore >= 75);
        const hold = results.filter((r) => r.totalScore >= 60 && r.totalScore < 75);
        const weak = results.filter((r) => r.totalScore >= 45 && r.totalScore < 60);
        const avoid = results.filter((r) => r.totalScore < 45);

        lines.push("### 主题强弱分布");
        lines.push("");
        if (strong.length > 0) {
          lines.push(`- **强势主题（增持）：** ${strong.map((r) => `${r.name}(${r.code})`).join("、")}`);
        }
        if (hold.length > 0) {
          lines.push(`- **中性主题（持有）：** ${hold.map((r) => `${r.name}(${r.code})`).join("、")}`);
        }
        if (weak.length > 0) {
          lines.push(`- **弱势主题（减持）：** ${weak.map((r) => `${r.name}(${r.code})`).join("、")}`);
        }
        if (avoid.length > 0) {
          lines.push(`- **回避主题（观望）：** ${avoid.map((r) => `${r.name}(${r.code})`).join("、")}`);
        }
        lines.push("");

        lines.push("### 调仓建议");
        lines.push("");
        const advices: string[] = [];
        if (strong.length > 0) {
          advices.push(`当前 ${strong.map((r) => r.name).join("、")} 等主题动量与资金表现较强，建议择机加仓或切换至这些方向。`);
        }
        if (avoid.length > 0) {
          advices.push(`${avoid.map((r) => r.name).join("、")} 等主题得分偏低，建议减仓或回避，等待轮动信号转强后再介入。`);
        }
        if (advices.length === 0) {
          advices.push("各主题得分较为均衡，建议维持现有配置，等待明确的轮动信号。");
        }
        lines.push(advices.join("\n"));
        lines.push("");

        lines.push("### 详细评分");
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
