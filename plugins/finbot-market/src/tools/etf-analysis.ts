import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const EtfAnalysisSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "ETF 代码，如 510050.SH、159915.SZ",
    },
  },
  required: ["symbol"],
};

// 接口定义
interface EtfQuoteData {
  price: number;
  changePercent: string;
  volume: number;
  iopv: number;
}

interface EtfInfoData {
  fundSize: number;
  managementFee: string;
  trackingIndex: string;
  establishDate: string;
}

interface EtfHolding {
  name: string;
  ratio: number;
}

interface EtfMoneyFlowData {
  dayNetInflow: number;
  week5NetInflow: number;
  week10NetInflow: number;
}

export function parseEtfSymbol(symbol: string): { code: string; secid: string } {
  const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
  if (!m) throw new Error("ETF 分析仅支持 A 股格式代码（如 510050.SH）");
  const [, code, exchange] = m;
  const marketId = exchange === "SH" ? 1 : 0;
  return { code, secid: `${marketId}.${code}` };
}

export function calcPremium(price: number, iopv: number): number {
  if (iopv === 0) return 0;
  return +((price - iopv) / iopv * 100).toFixed(2);
}

export function formatBillion(val: number): string {
  return val.toFixed(1) + " 亿";
}

// fetch 函数和 createEtfAnalysisTool 在后续 Task 中实现
export function createEtfAnalysisTool(): AnyAgentTool {
  return {
    name: "etfAnalysis",
    label: "ETF Analysis",
    description: "ETF 综合分析：规模、费率、跟踪指数、折溢价、近期收益、资金流向、前十大持仓",
    parameters: EtfAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol } = params as { symbol: string };
      try {
        parseEtfSymbol(symbol);
        return toToolResult({ content: `分析 ${symbol}`, isError: false });
      } catch (error) {
        return toToolResult({
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        });
      }
    },
  };
}
