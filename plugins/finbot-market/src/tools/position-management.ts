import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";

const DATA_DIR = path.join(process.env.HOME || "", ".openclaw", "finbot-positions");

export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  availableQuantity?: number;
  costPrice?: number;
  currentPrice?: number;
  marketValue: number;
  profit?: number;
  profitPercent?: number;
}

export interface Trade {
  time?: string;
  symbol: string;
  name?: string;
  direction: "buy" | "sell";
  price: number;
  quantity: number;
  amount?: number;
}

export interface AccountSummary {
  totalAsset: number;
  dailyProfit?: number;
  availableCash?: number;
  holdingMarketValue?: number;
  holdingProfit?: number;
  positionRatio: number;
}

export interface DailyRecord {
  date: string;
  holdings: Holding[];
  trades: Trade[];
  summary: AccountSummary;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    // TODO: 替换为 fs.access 更高效，当前因测试 mock 暂保留 readFile
    await fs.readFile(filePath, "utf-8");
    return true;
  } catch (e: unknown) {
    if (e instanceof Error && (e as any).code === "ENOENT") return false;
    throw e;
  }
}

const UpdatePositionSchema = {
  type: "object" as const,
  properties: {
    date: {
      type: "string" as const,
      description: "日期，格式 YYYY-MM-DD",
    },
    holdings: {
      type: "array" as const,
      description: "持仓列表",
      items: {
        type: "object" as const,
        required: ["symbol", "name", "quantity", "marketValue"] as const,
        properties: {
          symbol: { type: "string" as const },
          name: { type: "string" as const },
          quantity: { type: "number" as const },
          availableQuantity: { type: "number" as const },
          costPrice: { type: "number" as const },
          currentPrice: { type: "number" as const },
          marketValue: { type: "number" as const },
          profit: { type: "number" as const },
          profitPercent: { type: "number" as const },
        },
      },
    },
    trades: {
      type: "array" as const,
      description: "当日成交列表（可选）",
      items: {
        type: "object" as const,
        required: ["symbol", "direction", "price", "quantity"] as const,
        properties: {
          time: { type: "string" as const },
          symbol: { type: "string" as const },
          name: { type: "string" as const },
          direction: { type: "string" as const, enum: ["buy", "sell"] },
          price: { type: "number" as const },
          quantity: { type: "number" as const },
          amount: { type: "number" as const },
        },
      },
    },
    summary: {
      type: "object" as const,
      description: "账户汇总信息",
      required: ["totalAsset", "positionRatio"] as const,
      properties: {
        totalAsset: { type: "number" as const },
        dailyProfit: { type: "number" as const },
        availableCash: { type: "number" as const },
        holdingMarketValue: { type: "number" as const },
        holdingProfit: { type: "number" as const },
        positionRatio: { type: "number" as const },
      },
    },
  },
  required: ["date", "holdings", "summary"] as const,
};

export function createUpdatePositionTool(): AnyAgentTool {
  return {
    name: "updatePosition",
    label: "Update Position",
    description: "存储或更新某一天的持仓数据（持仓明细、成交记录、账户汇总），同时更新 latest.json 并追加到 positions.jsonl。",
    parameters: UpdatePositionSchema,
    execute: async (_toolCallId, params) => {
      try {
        const { date, holdings, trades, summary } = params as DailyRecord;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(holdings) || !summary) {
          return toToolResult({
            content: "参数错误：date 必须为 YYYY-MM-DD 格式，且 holdings、summary 为必填项",
            isError: true,
          });
        }

        for (const h of holdings) {
          if (typeof h.symbol !== "string" || typeof h.name !== "string") {
            return toToolResult({
              content: "参数错误：每条持仓必须包含 symbol 和 name 字符串",
              isError: true,
            });
          }
        }

        await fs.mkdir(DATA_DIR, { recursive: true });

        const record: DailyRecord = { date, holdings, trades: trades ?? [], summary };
        const dateFilePath = path.join(DATA_DIR, `${date}.json`);
        const latestFilePath = path.join(DATA_DIR, "latest.json");
        const jsonlFilePath = path.join(DATA_DIR, "positions.jsonl");

        const existed = await fileExists(dateFilePath);
        await fs.writeFile(dateFilePath, JSON.stringify(record, null, 2));
        await fs.writeFile(latestFilePath, JSON.stringify(record, null, 2));

        let jsonlContent = "";
        if (await fileExists(jsonlFilePath)) {
          jsonlContent = await fs.readFile(jsonlFilePath, "utf-8");
        }
        const lines = jsonlContent
          .split("\n")
          .filter((line) => line.trim() !== "")
          .filter((line) => {
            try {
              const parsed = JSON.parse(line);
              return parsed.date !== date;
            } catch {
              return true;
            }
          });
        lines.push(JSON.stringify(record));
        await fs.writeFile(jsonlFilePath, lines.join("\n") + "\n");

        const actionText = existed ? "已更新" : "已保存";
        const holdingSymbols = [...new Set(holdings.map((h) => h.symbol))].join(", ");
        const outputLines = [
          `${actionText} ${date} 持仓数据`,
          `- 持仓数: ${holdings.length}`,
          `- 成交数: ${(trades ?? []).length}`,
          `- 持仓标的: ${holdingSymbols || "无"}`,
          `- 总资产: ${summary.totalAsset.toFixed(2)}`,
          `- 当日盈亏: ${summary.dailyProfit?.toFixed(2) ?? "-"}`,
          `- 持仓市值: ${summary.holdingMarketValue?.toFixed(2) ?? "-"}`,
          `- 仓位: ${(summary.positionRatio * 100).toFixed(2)}%`,
          "",
          "⚠️ 不构成投资建议",
        ];

        return toToolResult({ content: outputLines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `保存持仓数据失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}

const GetPositionReportSchema = {
  type: "object" as const,
  properties: {
    date: {
      type: "string" as const,
      description: "日期，如 2026-05-12。默认取最新记录。",
    },
    days: {
      type: "number" as const,
      description: "历史回顾天数，如 7 或 30。提供后返回最近 N 天的持仓趋势汇总，而非单日报告。",
    },
  },
};

async function loadRecord(date: string): Promise<DailyRecord | null> {
  try {
    const filePath = path.join(DATA_DIR, `${date}.json`);
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as DailyRecord;
  } catch (e: unknown) {
    if (e instanceof Error && (e as any).code === "ENOENT") return null;
    throw e;
  }
}

async function loadLatestRecord(): Promise<DailyRecord | null> {
  try {
    const filePath = path.join(DATA_DIR, "latest.json");
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as DailyRecord;
  } catch (e: unknown) {
    if (e instanceof Error && (e as any).code === "ENOENT") return null;
    throw e;
  }
}

async function findPreviousDate(currentDate: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(DATA_DIR);
    const dates = entries
      .filter((f) => f.endsWith(".json") && f !== "latest.json")
      .map((f) => f.replace(/\.json$/, ""))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < currentDate)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  } catch (e: unknown) {
    if (e instanceof Error && (e as any).code === "ENOENT") return null;
    throw e;
  }
}

async function loadRecentRecords(days: number): Promise<DailyRecord[]> {
  try {
    const entries = await fs.readdir(DATA_DIR);
    const dates = entries
      .filter((f) => f.endsWith(".json") && f !== "latest.json")
      .map((f) => f.replace(/\.json$/, ""))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .slice(-days);

    const records: DailyRecord[] = [];
    for (const date of dates) {
      const record = await loadRecord(date);
      if (record) records.push(record);
    }
    return records;
  } catch (e: unknown) {
    if (e instanceof Error && (e as any).code === "ENOENT") return [];
    throw e;
  }
}

interface PositionChange {
  symbol: string;
  name: string;
  change: number;
  reason: string;
}

function calculateChanges(current: Holding[], previous: Holding[]): PositionChange[] {
  const prevMap = new Map(previous.map((h) => [h.symbol, h]));
  const currMap = new Map(current.map((h) => [h.symbol, h]));
  const changes: PositionChange[] = [];

  for (const h of current) {
    const prev = prevMap.get(h.symbol);
    if (prev) {
      const diff = h.quantity - prev.quantity;
      if (diff !== 0) {
        changes.push({
          symbol: h.symbol,
          name: h.name,
          change: diff,
          reason: diff > 0 ? "买入" : "卖出",
        });
      }
    } else {
      changes.push({
        symbol: h.symbol,
        name: h.name,
        change: h.quantity,
        reason: "新开仓",
      });
    }
  }

  for (const h of previous) {
    if (!currMap.has(h.symbol)) {
      changes.push({
        symbol: h.symbol,
        name: h.name,
        change: -h.quantity,
        reason: "清仓",
      });
    }
  }

  return changes;
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return "-";
  return n.toFixed(2);
}

function formatPercent(n: number | undefined): string {
  if (n === undefined || n === null) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

function formatReport(current: DailyRecord, previous: DailyRecord | null): string {
  const lines: string[] = [];
  lines.push(`## 持仓日报（${current.date}）`);
  lines.push("");

  lines.push("### 账户概览");
  const s = current.summary;
  lines.push(`- **总资产**: ${formatNumber(s.totalAsset)}`);
  lines.push(`- **持仓市值**: ${formatNumber(s.holdingMarketValue)}`);
  lines.push(`- **当日盈亏**: ${formatNumber(s.dailyProfit)}`);
  lines.push(`- **可用现金**: ${formatNumber(s.availableCash)}`);
  lines.push(`- **仓位**: ${formatPercent(s.positionRatio)}`);
  lines.push("");

  if (previous) {
    lines.push("### 对比昨日");
    const ps = previous.summary;
    lines.push(`| 指标 | 今日 | 昨日 | 变化 |`);
    lines.push(`|------|------|------|------|`);
    const assetChange = s.totalAsset - ps.totalAsset;
    lines.push(`| 总资产 | ${formatNumber(s.totalAsset)} | ${formatNumber(ps.totalAsset)} | ${assetChange >= 0 ? "+" : ""}${formatNumber(assetChange)} |`);
    const mvChange = (s.holdingMarketValue ?? 0) - (ps.holdingMarketValue ?? 0);
    lines.push(`| 持仓市值 | ${formatNumber(s.holdingMarketValue)} | ${formatNumber(ps.holdingMarketValue)} | ${mvChange >= 0 ? "+" : ""}${formatNumber(mvChange)} |`);
    const ratioChange = (s.positionRatio ?? 0) - (ps.positionRatio ?? 0);
    lines.push(`| 仓位 | ${formatPercent(s.positionRatio)} | ${formatPercent(ps.positionRatio)} | ${ratioChange >= 0 ? "+" : ""}${formatPercent(ratioChange)} |`);
    lines.push("");
  }

  lines.push("### 持仓明细");
  if (current.holdings.length === 0) {
    lines.push("无持仓");
  } else {
    lines.push(`| 代码 | 名称 | 数量 | 市值 | 盈亏 | 占比 |`);
    lines.push(`|------|------|------|------|------|------|`);
    for (const h of current.holdings) {
      const ratio = h.marketValue / (s.holdingMarketValue || s.totalAsset || 1);
      lines.push(`| ${h.symbol} | ${h.name} | ${h.quantity} | ${formatNumber(h.marketValue)} | ${formatNumber(h.profit)} | ${formatPercent(ratio)} |`);
    }
  }
  lines.push("");

  lines.push("### 当日成交");
  if (!current.trades || current.trades.length === 0) {
    lines.push("无成交");
  } else {
    lines.push(`| 时间 | 代码 | 方向 | 价格 | 数量 | 金额 |`);
    lines.push(`|------|------|------|------|------|------|`);
    for (const t of current.trades) {
      const dir = t.direction === "buy" ? "买入" : "卖出";
      lines.push(`| ${t.time || "-"} | ${t.symbol} | ${dir} | ${formatNumber(t.price)} | ${t.quantity} | ${formatNumber(t.amount)} |`);
    }
  }
  lines.push("");

  if (previous) {
    const changes = calculateChanges(current.holdings, previous.holdings);
    lines.push("### 持仓变动");
    if (changes.length === 0) {
      lines.push("无变动");
    } else {
      for (const c of changes) {
        const sign = c.change > 0 ? "+" : "";
        lines.push(`- **${c.name}（${c.symbol}）**: ${sign}${c.change}（${c.reason}）`);
      }
    }
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

function formatHistoryReport(records: DailyRecord[]): string {
  if (records.length === 0) {
    return "未找到持仓记录。";
  }

  const lines: string[] = [];
  const first = records[0];
  const last = records[records.length - 1];
  lines.push(`## 持仓历史回顾（${first.date} ~ ${last.date}，共 ${records.length} 天）`);
  lines.push("");

  lines.push("### 资产趋势");
  lines.push(`| 日期 | 总资产 | 持仓市值 | 仓位 | 当日盈亏 |`);
  lines.push(`|------|--------|----------|------|----------|`);
  for (const r of records) {
    const s = r.summary;
    lines.push(
      `| ${r.date} | ${formatNumber(s.totalAsset)} | ${formatNumber(s.holdingMarketValue)} | ${formatPercent(s.positionRatio)} | ${formatNumber(s.dailyProfit)} |`
    );
  }
  lines.push("");

  const assetChange = last.summary.totalAsset - first.summary.totalAsset;
  const mvChange = (last.summary.holdingMarketValue ?? 0) - (first.summary.holdingMarketValue ?? 0);
  lines.push("### 阶段统计");
  lines.push(`- **区间天数**: ${records.length}`);
  lines.push(`- **总资产变化**: ${assetChange >= 0 ? "+" : ""}${formatNumber(assetChange)}`);
  lines.push(`- **持仓市值变化**: ${mvChange >= 0 ? "+" : ""}${formatNumber(mvChange)}`);

  const totalTrades = records.reduce((sum, r) => sum + (r.trades?.length ?? 0), 0);
  lines.push(`- **总成交笔数**: ${totalTrades}`);
  lines.push("");

  const allTrades: Trade[] = [];
  for (const r of records) {
    if (r.trades) {
      for (const t of r.trades) {
        allTrades.push(t);
      }
    }
  }

  if (allTrades.length > 0) {
    lines.push("### 成交明细");
    lines.push(`| 日期 | 时间 | 代码 | 方向 | 价格 | 数量 | 金额 |`);
    lines.push(`|------|------|------|------|------|------|------|`);
    for (const t of allTrades) {
      const dir = t.direction === "buy" ? "买入" : "卖出";
      lines.push(`| ${t.time ? t.time.split(" ")[0] : "-"} | ${t.time ? t.time.split(" ")[1] || t.time : "-"} | ${t.symbol} | ${dir} | ${formatNumber(t.price)} | ${t.quantity} | ${formatNumber(t.amount)} |`);
    }
    lines.push("");
  }

  lines.push("### 持仓变动汇总");
  const positionMap = new Map<string, { name: string; firstQty: number; lastQty: number }>();
  for (const r of records) {
    for (const h of r.holdings) {
      const entry = positionMap.get(h.symbol);
      if (!entry) {
        positionMap.set(h.symbol, { name: h.name, firstQty: h.quantity, lastQty: h.quantity });
      } else {
        entry.lastQty = h.quantity;
      }
    }
  }

  if (positionMap.size === 0) {
    lines.push("无持仓记录");
  } else {
    for (const [symbol, info] of positionMap) {
      const diff = info.lastQty - info.firstQty;
      const sign = diff > 0 ? "+" : "";
      lines.push(`- **${info.name}（${symbol}）**: ${info.firstQty} → ${info.lastQty}（${sign}${diff}）`);
    }
  }
  lines.push("");

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export function createGetPositionReportTool(): AnyAgentTool {
  return {
    name: "getPositionReport",
    label: "Get Position Report",
    description: "获取持仓报告。支持指定日期或默认取最新记录，自动对比前一日持仓变化。也支持传入 days 参数（如 7 或 30）获取最近 N 天的持仓历史趋势汇总。",
    parameters: GetPositionReportSchema,
    execute: async (_toolCallId, params) => {
      try {
        const p = params as { date?: string; days?: number };

        if (p.days && typeof p.days === "number" && p.days > 0) {
          const records = await loadRecentRecords(p.days);
          if (records.length === 0) {
            return toToolResult({
              content: "未找到持仓记录。请先使用 updatePosition 录入数据。",
              isError: true,
            });
          }
          const report = formatHistoryReport(records);
          return toToolResult({ content: report });
        }

        let record: DailyRecord | null = null;
        let date: string | undefined;

        if (p.date && typeof p.date === "string") {
          date = p.date;
          record = await loadRecord(date);
        } else {
          record = await loadLatestRecord();
          if (record) {
            date = record.date;
          }
        }

        if (!record || !date) {
          return toToolResult({
            content: "未找到持仓记录。请先使用 updatePosition 录入数据。",
            isError: true,
          });
        }

        const prevDate = await findPreviousDate(date);
        const previous = prevDate ? await loadRecord(prevDate) : null;
        const report = formatReport(record, previous);

        return toToolResult({ content: report });
      } catch (error) {
        return toToolResult({
          content: `生成持仓报告失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
