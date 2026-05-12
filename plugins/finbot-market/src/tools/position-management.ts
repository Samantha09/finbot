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

export function createGetPositionReportTool(): AnyAgentTool {
  return {
    name: "getPositionReport",
    label: "Get Position Report",
    description: "获取持仓报告。",
    parameters: {
      type: "object" as const,
      properties: {},
    },
    execute: async (_toolCallId, _params) => {
      return toToolResult({ content: "getPositionReport 尚未实现" });
    },
  };
}
