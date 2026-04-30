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
  fundName: string;
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
  const explicit = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
  if (explicit) {
    const [, code, exchange] = explicit;
    const marketId = exchange === "SH" ? 1 : 0;
    return { code, secid: `${marketId}.${code}` };
  }

  const bare = symbol.match(/^(\d{6})$/);
  if (bare) {
    const code = bare[1];
    const prefix = code.slice(0, 2);
    const shPrefixes = ["50", "51", "52", "56", "58", "60", "68"];
    const szPrefixes = ["15", "16", "17", "18"];
    if (shPrefixes.includes(prefix)) {
      return { code, secid: `1.${code}` };
    }
    if (szPrefixes.includes(prefix)) {
      return { code, secid: `0.${code}` };
    }
  }

  throw new Error("ETF 分析仅支持 A 股格式代码（如 510050.SH）");
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
    fundName: d.f58 ? String(d.f58) : "N/A",
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

async function fetchForexRate(): Promise<string | null> {
  try {
    const url = "https://api.exchangerate-api.com/v4/latest/USD";
    const response = await fetch(url);
    const json = await response.json();
    const rate = json.rates?.CNY;
    if (typeof rate !== "number") return null;
    return rate.toFixed(4);
  } catch {
    return null;
  }
}

function isQdiiEtf(info: EtfInfoData): boolean {
  const text = `${info.fundName} ${info.trackingIndex}`.toLowerCase();
  return text.includes("qdii") || text.includes("海外") || text.includes("nasdaq") || text.includes("标普") || text.includes("hong kong") || text.includes("港股") || text.includes("美股");
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

function formatEtfOutput(
  symbol: string,
  quote: EtfQuoteData,
  info: EtfInfoData,
  holdings: EtfHolding[],
  moneyFlow: EtfMoneyFlowData,
  forexRate: string | null,
): string {
  const premium = calcPremium(quote.price, quote.iopv);
  const premiumText = premium > 0 ? `溢价 ${premium}%` : premium < 0 ? `折价 ${Math.abs(premium)}%` : "平价";
  const changeSign = quote.changePercent.startsWith("-") ? "" : "+";
  const changeEmoji = quote.changePercent.startsWith("-") ? "🔴" : "🟢";

  const qdii = isQdiiEtf(info);

  const lines: string[] = [
    `📊 ${symbol} ETF 综合分析`,
    "",
    "**基本信息**:",
    `  基金名称: ${info.fundName}`,
    `  基金规模: ${formatBillion(info.fundSize)}`,
    `  管理费率: ${info.managementFee}`,
    `  跟踪指数: ${info.trackingIndex}`,
    `  成立日期: ${info.establishDate}`,
    "",
    "**行情与折溢价**:",
    `  最新价格: ${quote.price.toFixed(3)}  (${changeEmoji} ${changeSign}${quote.changePercent})`,
    `  IOPV净值: ${quote.iopv.toFixed(4)}`,
    `  折溢价率: ${premiumText}`,
    `  成交量: ${quote.volume?.toLocaleString() ?? "N/A"}`,
    "",
    "**资金流向**:",
    `  当日主力净流入: ${moneyFlow.dayNetInflow >= 0 ? "+" : ""}${formatBillion(moneyFlow.dayNetInflow)}`,
    `  近5日主力净流入: ${moneyFlow.week5NetInflow >= 0 ? "+" : ""}${formatBillion(moneyFlow.week5NetInflow)}`,
    `  近10日主力净流入: ${moneyFlow.week10NetInflow >= 0 ? "+" : ""}${formatBillion(moneyFlow.week10NetInflow)}`,
    "",
  ];

  if (qdii && forexRate) {
    lines.push(
      "**汇率影响（QDII）**:",
      `  美元兑人民币: ${forexRate}`,
      "  提示: 人民币升值对 QDII 净值有负面影响，贬值则有利",
      "",
    );
  }

  if (holdings.length > 0) {
    lines.push("**前十大持仓**:", "| 股票 | 占比 |", "|------|------|");
    for (const h of holdings) {
      lines.push(`| ${h.name} | ${h.ratio}% |`);
    }
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export function createEtfAnalysisTool(): AnyAgentTool {
  return {
    name: "etfAnalysis",
    label: "ETF Analysis",
    description: "ETF 综合分析：规模、费率、跟踪指数、折溢价、近期收益、资金流向、前十大持仓",
    parameters: EtfAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol } = params as { symbol: string };

      try {
        const { secid, code } = parseEtfSymbol(symbol);

        const [quote, info, holdings, moneyFlow] = await Promise.all([
          fetchEtfQuote(secid).catch(() => null),
          fetchEtfInfo(secid).catch(() => null),
          fetchEtfHoldings(code).catch(() => []),
          fetchEtfMoneyFlow(code).catch(() => ({ dayNetInflow: 0, week5NetInflow: 0, week10NetInflow: 0 })),
        ]);

        if (!quote && !info && holdings.length === 0) {
          return toToolResult({ content: "未能获取到任何数据，请检查代码是否正确", isError: true });
        }

        const safeQuote = quote ?? { price: 0, changePercent: "0%", volume: 0, iopv: 0 };
        const safeInfo = info ?? { fundName: "N/A", fundSize: 0, managementFee: "N/A", trackingIndex: "N/A", establishDate: "N/A" };
        const safeHoldings = holdings;
        const safeMoneyFlow = moneyFlow ?? { dayNetInflow: 0, week5NetInflow: 0, week10NetInflow: 0 };

        let forexRate: string | null = null;
        if (isQdiiEtf(safeInfo)) {
          forexRate = await fetchForexRate().catch(() => null);
        }

        const output = formatEtfOutput(symbol, safeQuote, safeInfo, safeHoldings, safeMoneyFlow, forexRate);
        return toToolResult({ content: output });
      } catch (error) {
        return toToolResult({
          content: `ETF 分析失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
