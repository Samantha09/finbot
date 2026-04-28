import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const FundamentalAnalysisSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "A 股代码，如 600519.SH、000858.SZ",
    },
  },
  required: ["symbol"],
};

interface FinanceData {
  reportDate: string;
  reportType: string;
  eps: number;
  bps: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  debtRatio: number;
  revenue: number;
  netProfit: number;
  revenueYoY: number;
  profitYoY: number;
}

function parseSymbol(symbol: string): { code: string; prefix: string } {
  const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
  if (!m) throw new Error("基本面分析仅支持 A 股代码格式（如 600519.SH）");
  const [, code, exchange] = m;
  const prefix = exchange === "SH" ? "SH" : "SZ";
  return { code, prefix };
}

async function fetchFinanceData(symbol: string): Promise<FinanceData[]> {
  const { code, prefix } = parseSymbol(symbol);
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${prefix}${code}`;

  const response = await fetch(url);
  const json = await response.json();

  const rows: Array<Record<string, unknown>> = json.data ?? [];
  if (rows.length === 0) throw new Error("未获取到财务数据");

  return rows.slice(0, 4).map((row) => ({
    reportDate: String(row.REPORT_DATE ?? "").slice(0, 10),
    reportType: String(row.REPORT_DATE_NAME ?? ""),
    eps: Number(row.EPSJB ?? 0),
    bps: Number(row.BPS ?? 0),
    roe: Number(row.ROEJQ ?? 0),
    grossMargin: Number(row.XSMLL ?? 0),
    netMargin: Number(row.XSJLL ?? 0),
    debtRatio: Number(row.ZCFZL ?? 0),
    revenue: Number(row.TOTALOPERATEREVE ?? 0),
    netProfit: Number(row.PARENTNETPROFIT ?? 0),
    revenueYoY: Number(row.TOTALOPERATEREVETZ ?? 0),
    profitYoY: Number(row.PARENTNETPROFITTZ ?? 0),
  }));
}

function fmtBillion(val: number): string {
  return (val / 1e8).toFixed(1) + " 亿";
}

function fmtYoY(val: number): string {
  if (val === 0) return "N/A";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

export function createFundamentalAnalysisTool(): AnyAgentTool {
  return {
    name: "fundamentalAnalysis",
    label: "Fundamental Analysis",
    description: "查询 A 股基本面财务数据：PE/PB/ROE/毛利率/净利率/营收/净利润等，含最近 4 期报告",
    parameters: FundamentalAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol } = params as { symbol: string };

      try {
        const reports = await fetchFinanceData(symbol);
        const latest = reports[0];

        const lines: string[] = [
          `📋 ${symbol} 基本面分析`,
          `最新报告: ${latest.reportType}`,
          "",
          "### 盈利能力",
          `**EPS(每股收益)**: ${latest.eps} 元`,
          `**BPS(每股净资产)**: ${latest.bps.toFixed(2)} 元`,
          `**ROE(加权)**: ${latest.roe}%`,
          `**毛利率**: ${latest.grossMargin}%`,
          `**净利率**: ${latest.netMargin}%`,
          "",
          "### 营收与利润",
          `**营业总收入**: ${fmtBillion(latest.revenue)} (同比 ${fmtYoY(latest.revenueYoY)})`,
          `**归母净利润**: ${fmtBillion(latest.netProfit)} (同比 ${fmtYoY(latest.profitYoY)})`,
          "",
          "### 财务健康",
          `**资产负债率**: ${latest.debtRatio}%`,
          "",
        ];

        if (reports.length > 1) {
          lines.push("### 近 4 期核心指标对比", "");
          lines.push("| 报告期 | EPS | ROE | 毛利率 | 净利率 | 营收同比 | 净利润同比 |");
          lines.push("|--------|-----|-----|--------|--------|----------|-----------|");
          for (const r of reports) {
            lines.push(
              `| ${r.reportType} | ${r.eps} | ${r.roe}% | ${r.grossMargin}% | ${r.netMargin}% | ${fmtYoY(r.revenueYoY)} | ${fmtYoY(r.profitYoY)} |`,
            );
          }
          lines.push("");
        }

        lines.push("⚠️ 数据来自东方财富 F10，不构成投资建议");

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `基本面分析失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
