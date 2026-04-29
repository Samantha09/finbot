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

async function fetchEtfQuote(secid: string): Promise<EtfQuoteData> {
  const fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f135";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`;

  const response = await fetch(url);
  const json = await response.json();

  if (json.rc !== 0 || !json.data) {
    throw new Error("行情数据获取失败");
  }

  const d = json.data;
  const divisor = 100;

  return {
    price: d.f43 / divisor,
    changePercent: (d.f170 / 100).toFixed(2) + "%",
    volume: d.f47,
    iopv: d.f135 ? d.f135 / 1000 : 0,
  };
}

async function fetchEtfInfo(secid: string): Promise<EtfInfoData> {
  const fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f135,f191,f192,f193";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`;

  const response = await fetch(url);
  const json = await response.json();

  if (json.rc !== 0 || !json.data) {
    throw new Error("基本信息获取失败");
  }

  const d = json.data;
  return {
    fundSize: d.f191 ? d.f191 / 1e8 : 0,
    managementFee: d.f192 ? (d.f192 / 100).toFixed(2) + "%" : "N/A",
    trackingIndex: d.f193 ? String(d.f193) : "N/A",
    establishDate: "N/A",
  };
}

async function fetchEtfHoldings(code: string): Promise<EtfHolding[]> {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_FUND_PORTFOLIO_STOCK&columns=ALL&filter=(FUND_CODE="${code}")&pageNumber=1&pageSize=10`;

  const response = await fetch(url);
  const json = await response.json();

  const rows: Array<Record<string, unknown>> = json.result?.data ?? [];
  if (rows.length === 0) throw new Error("持仓数据获取失败");

  return rows.slice(0, 10).map((row) => ({
    name: String(row.SECURITY_NAME_ABBR ?? ""),
    ratio: Number(row.RATIO ?? 0),
  }));
}

async function fetchEtfMoneyFlow(code: string): Promise<EtfMoneyFlowData> {
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ETF_MONEYFLOW&columns=ALL&filter=(SECURITY_CODE="${code}")&pageNumber=1&pageSize=1`;

  const response = await fetch(url);
  const json = await response.json();

  const rows: Array<Record<string, unknown>> = json.result?.data ?? [];
  if (rows.length === 0) throw new Error("资金流向数据获取失败");

  const row = rows[0];
  return {
    dayNetInflow: Number(row.NET_INFLOW ?? 0) / 1e8,
    week5NetInflow: Number(row.NET_INFLOW_5DAY ?? row.NET_INFLOW ?? 0) / 1e8,
    week10NetInflow: Number(row.NET_INFLOW_10DAY ?? row.NET_INFLOW ?? 0) / 1e8,
  };
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
