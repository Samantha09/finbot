import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const FundSelectionStrategySchema = {
  type: "object" as const,
  properties: {
    strategy: {
      type: "string" as const,
      description: "策略类型：trend=趋势跟随 contrarian=逆势布局 balanced=均衡配置",
    },
    period: {
      type: "string" as const,
      description: "投资周期：short=短期(1月内) medium=中期(3-6月) long=长期(1年+)",
    },
    maxResults: {
      type: "integer" as const,
      description: "返回数量上限，默认 5",
    },
  },
  required: ["strategy", "period"],
};

interface GfEtfRankItem {
  code: string;
  name: string;
  exchange: number;
  roc: number | string;
  fndNet?: number | string;
  turnover_rate?: number | string;
  fundSize?: number | string;
  premium?: number | string;
  continueRiseDay?: number | string;
}

interface GfEtfSuperFundItem {
  etfcode: string;
  etfname: string;
  mktCd: string;
  fndNet: number | string;
  fndNetPercent: number | string;
  details: Array<{ tradeDate: string; fndNetIn: number | string }>;
}

interface GfFundDetailItem {
  tradeCode?: string;
  chiName?: string;
  secuAbbr?: string;
  fundType?: string;
  riskLevel?: string;
  shareNav?: number | string;
  return1w?: number | string;
  return1m?: number | string;
  return3m?: number | string;
  return6m?: number | string;
  return1y?: number | string;
  return3y?: number | string;
  returnTn?: number | string;
  assetScale?: number | string;
  fundManageCorp?: string;
  isAllowBuy?: string;
  isAllowRedeem?: string;
  extraInfo?: { investTarget?: string; riskReturnFeature?: string };
  report?: string;
}

interface StrategyResult {
  etf: GfEtfRankItem | GfEtfSuperFundItem;
  detail?: GfFundDetailItem;
  score: number;
  reason: string[];
}

const GF_API_ENDPOINT = "https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call";

function getApiKey(): string {
  const key = process.env.GF_SKILLS_APIKEY;
  if (!key) throw new Error("GF_SKILLS_APIKEY not configured");
  return key;
}

async function gfCall(service: string, tool: string, args: Record<string, unknown>) {
  const res = await fetch(GF_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({ service_name: service, tool_name: tool, args }),
  });
  return res.json();
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function fmtPct(v: unknown): string {
  const n = toNum(v);
  if (n === undefined) return "N/A";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

async function fetchRank(type: number, size: number): Promise<GfEtfRankItem[]> {
  const data = (await gfCall("etf_rank", "finance-api_product_etf_rank_get", { type, size })) as {
    data?: { data?: GfEtfRankItem[] };
  };
  return data.data?.data || [];
}

async function fetchSuperFund(type: string): Promise<GfEtfSuperFundItem[]> {
  const data = (await gfCall("etf-super-fund", "gfmiddle_eits_super_fund_etf_superfund_get", { type })) as {
    data?: { data?: GfEtfSuperFundItem[] };
  };
  return data.data?.data || [];
}

async function fetchFundDetail(tradeCode: string): Promise<GfFundDetailItem | undefined> {
  const data = (await gfCall("jijin_info", "finance-api_product_fund_detail_get", { tradeCode })) as {
    data?: { data?: GfFundDetailItem };
  };
  return data.data?.data;
}

function scoreTrend(etf: GfEtfRankItem, detail?: GfFundDetailItem): { score: number; reason: string[] } {
  const reason: string[] = [];
  let score = 50;
  const roc = toNum(etf.roc);
  const turnover = toNum(etf.turnover_rate);
  const fundSize = toNum(etf.fundSize);

  if (roc !== undefined && roc > 2) { score += 15; reason.push(`当日涨幅 ${fmtPct(roc)}，动量较强`); }
  else if (roc !== undefined && roc > 0) { score += 5; reason.push(`当日涨幅 ${fmtPct(roc)}，正向动量`); }
  else if (roc !== undefined && roc < -2) { score -= 15; reason.push(`当日跌幅 ${fmtPct(roc)}，动量转弱`); }

  if (turnover !== undefined && turnover > 5) { score += 10; reason.push(`换手率 ${fmtPct(turnover)}，交投活跃`); }
  if (fundSize !== undefined && fundSize > 1e9) { score += 5; reason.push("规模适中，流动性好"); }

  if (detail) {
    if (detail.isAllowBuy !== "1") { score -= 20; reason.push("当前暂停购买，需注意"); }
    const r1m = toNum(detail.return1m);
    if (r1m !== undefined && r1m > 5) { score += 10; reason.push(`近1月收益 ${fmtPct(r1m)}`); }
    const r3m = toNum(detail.return3m);
    if (r3m !== undefined && r3m > 10) { score += 10; reason.push(`近3月收益 ${fmtPct(r3m)}`); }
  }

  return { score: Math.min(100, Math.max(0, score)), reason };
}

function scoreContrarian(etf: GfEtfRankItem, superItem?: GfEtfSuperFundItem, detail?: GfFundDetailItem): { score: number; reason: string[] } {
  const reason: string[] = [];
  let score = 50;
  const roc = toNum(etf.roc);
  const fundSize = toNum(etf.fundSize);

  if (roc !== undefined && roc < -2) { score += 15; reason.push(`当日跌幅 ${fmtPct(roc)}，存在超跌修复空间`); }
  else if (roc !== undefined && roc < 0) { score += 5; reason.push(`当日微跌 ${fmtPct(roc)}`); }
  else if (roc !== undefined && roc > 2) { score -= 15; reason.push(`当日大涨 ${fmtPct(roc)}，非左侧机会`); }

  if (superItem) {
    const net = toNum(superItem.fndNet);
    if (net !== undefined && net > 0) { score += 15; reason.push(`资金净流入 ${net.toFixed(0)} 万元，有承接`); }
    if (superItem.details && superItem.details.length >= 3) {
      const recent3 = superItem.details.slice(0, 3).map((d) => toNum(d.fndNetIn) || 0);
      const avg = recent3.reduce((a, b) => a + b, 0) / recent3.length;
      if (avg > 0) { score += 10; reason.push("近3日资金持续流入，左侧信号"); }
    }
  }

  if (fundSize !== undefined && fundSize > 5e8) { score += 5; reason.push("规模充足，抗风险能力较好"); }

  if (detail) {
    const r3m = toNum(detail.return3m);
    if (r3m !== undefined && r3m < -10) { score += 10; reason.push(`近3月跌幅较大 ${fmtPct(r3m)}，赔率提升`); }
    const pe = toNum((detail as any).pe);
    if (pe !== undefined && pe < 20) { score += 10; reason.push(`估值偏低（PE ${pe.toFixed(1)}）`); }
  }

  return { score: Math.min(100, Math.max(0, score)), reason };
}

function scoreBalanced(etf: GfEtfRankItem, detail?: GfFundDetailItem): { score: number; reason: string[] } {
  const reason: string[] = [];
  let score = 50;
  const roc = toNum(etf.roc);
  const turnover = toNum(etf.turnover_rate);
  const fundSize = toNum(etf.fundSize);

  if (roc !== undefined && Math.abs(roc) < 2) { score += 10; reason.push(`波动温和 ${fmtPct(roc)}`); }
  if (turnover !== undefined && turnover > 1 && turnover < 10) { score += 5; reason.push("流动性适中"); }
  if (fundSize !== undefined && fundSize > 1e9) { score += 10; reason.push("规模较大，运作稳定"); }

  if (detail) {
    const r1y = toNum(detail.return1y);
    if (r1y !== undefined && r1y > 10) { score += 10; reason.push(`近1年收益 ${fmtPct(r1y)}`); }
    const r3y = toNum(detail.return3y);
    if (r3y !== undefined && r3y > 30) { score += 10; reason.push(`近3年收益 ${fmtPct(r3y)}，长期表现稳健`); }
    if (detail.isAllowBuy === "1" && detail.isAllowRedeem === "1") { score += 5; reason.push("申赎正常"); }
    if (detail.report?.includes("优秀") || detail.report?.includes("良好")) { score += 10; reason.push(`综合评价：${detail.report}`); }
  }

  return { score: Math.min(100, Math.max(0, score)), reason };
}

async function runTrendStrategy(maxResults: number): Promise<StrategyResult[]> {
  const [fundList, netBuyList] = await Promise.all([
    fetchRank(4, 10),
    fetchRank(12, 10),
  ]);

  const codeSet = new Map<string, GfEtfRankItem>();
  for (const e of fundList) codeSet.set(e.code, e);
  for (const e of netBuyList) if (!codeSet.has(e.code)) codeSet.set(e.code, e);

  const results: StrategyResult[] = [];
  for (const etf of codeSet.values()) {
    const detail = await fetchFundDetail(etf.code);
    const { score, reason } = scoreTrend(etf, detail);
    results.push({ etf, detail, score, reason });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

async function runContrarianStrategy(maxResults: number): Promise<StrategyResult[]> {
  const [declineList, superFund] = await Promise.all([
    fetchRank(2, 15),
    fetchSuperFund("持续流入"),
  ]);

  const superMap = new Map<string, GfEtfSuperFundItem>();
  for (const s of superFund) superMap.set(s.etfcode, s);

  const results: StrategyResult[] = [];
  for (const etf of declineList) {
    const superItem = superMap.get(etf.code);
    const detail = await fetchFundDetail(etf.code);
    const { score, reason } = scoreContrarian(etf, superItem, detail);
    results.push({ etf, detail, score, reason });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

async function runBalancedStrategy(maxResults: number): Promise<StrategyResult[]> {
  const list = await fetchRank(1, 20);
  const results: StrategyResult[] = [];

  for (const etf of list) {
    const detail = await fetchFundDetail(etf.code);
    const { score, reason } = scoreBalanced(etf, detail);
    results.push({ etf, detail, score, reason });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

function formatStrategyResults(
  strategy: string,
  period: string,
  results: StrategyResult[],
): string {
  const strategyLabels: Record<string, string> = {
    trend: "趋势跟随",
    contrarian: "逆势布局",
    balanced: "均衡配置",
  };
  const periodLabels: Record<string, string> = {
    short: "短期（1月内）",
    medium: "中期（3-6月）",
    long: "长期（1年+）",
  };

  const lines: string[] = [];
  lines.push(`## ${strategyLabels[strategy] || strategy} 策略结果`);
  lines.push(`**周期：** ${periodLabels[period] || period} ｜ **推荐数量：** ${results.length} 只`);
  lines.push("");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const etf = r.etf as GfEtfRankItem;
    const code = etf.code || (r.etf as any).etfcode || "N/A";
    const name = etf.name || (r.etf as any).etfname || "N/A";
    const exchange = etf.exchange === 101 ? "SH" : etf.exchange === 105 ? "SZ" : (r.etf as any).mktCd || "N/A";

    lines.push(`### ${i + 1}. ${code} | ${name}（${exchange}）`);
    lines.push(`- **策略评分：** ${r.score}/100`);
    lines.push(`- **当日涨跌：** ${fmtPct(etf.roc)}`);

    if (r.detail) {
      const d = r.detail;
      if (d.shareNav) lines.push(`- **最新净值：** ${toNum(d.shareNav)?.toFixed(4) || "N/A"}`);
      if (d.return1m !== undefined) lines.push(`- **近1月收益：** ${fmtPct(d.return1m)}`);
      if (d.return3m !== undefined) lines.push(`- **近3月收益：** ${fmtPct(d.return3m)}`);
      if (d.return1y !== undefined) lines.push(`- **近1年收益：** ${fmtPct(d.return1y)}`);
      const scale = toNum(d.assetScale);
      if (scale !== undefined) lines.push(`- **资产规模：** ${(scale / 1e8).toFixed(2)} 亿`);
      lines.push(`- **申赎状态：** ${d.isAllowBuy === "1" ? "可购买" : "暂停"} / ${d.isAllowRedeem === "1" ? "可赎回" : "暂停"}`);
    }

    lines.push(`- **评分理由：**`);
    for (const reason of r.reason) {
      lines.push(`  - ${reason}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("⚠️ 不构成投资建议。策略评分基于公开数据量化计算，请结合自身风险偏好决策。");
  return lines.join("\n");
}

export async function executeFundSelectionStrategy(
  strategy: string,
  period: string,
  maxResults: number,
): Promise<string> {
  const results =
    strategy === "trend"
      ? await runTrendStrategy(maxResults)
      : strategy === "contrarian"
        ? await runContrarianStrategy(maxResults)
        : await runBalancedStrategy(maxResults);

  return formatStrategyResults(strategy, period, results);
}

export function createFundSelectionStrategyTool(): AnyAgentTool {
  return {
    name: "fundSelectionStrategy",
    label: "基金选基策略",
    description:
      "执行量化选基策略：trend（趋势跟随，追资金热点）、contrarian（逆势布局，找超跌+资金承接）、balanced（均衡配置，看长期稳健性）。需指定投资周期 short/medium/long。",
    parameters: FundSelectionStrategySchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as Record<string, unknown>;
        const strategy = String(p.strategy || "").trim();
        const period = String(p.period || "").trim();
        const maxResults = Math.min(10, Math.max(1, Number(p.maxResults) || 5));

        const validStrategies = ["trend", "contrarian", "balanced"];
        if (!validStrategies.includes(strategy)) {
          return toToolResult({
            content: `策略类型必须是以下之一：${validStrategies.join("、")}`,
            isError: true,
          });
        }

        const validPeriods = ["short", "medium", "long"];
        if (!validPeriods.includes(period)) {
          return toToolResult({
            content: `投资周期必须是以下之一：${validPeriods.join("、")}`,
            isError: true,
          });
        }

        const output = await executeFundSelectionStrategy(strategy, period, maxResults);
        return toToolResult({ content: output });
      } catch (error) {
        return toToolResult({
          content: `策略执行失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
