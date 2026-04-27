import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";

const SetAlertSchema = {
  type: "object" as const,
  properties: {
    symbol: { type: "string" as const },
    condition: {
      type: "string" as const,
      enum: ["above", "below"],
    },
    price: { type: "number" as const },
    message: { type: "string" as const },
  },
  required: ["symbol", "condition", "price"],
};

interface PriceAlert {
  id: string;
  symbol: string;
  condition: "above" | "below";
  price: number;
  message: string;
  createdAt: string;
  triggered: boolean;
}

const ALERTS_FILE = path.join(
  process.env.HOME || "",
  ".openclaw",
  "finbot-alerts.json",
);

async function loadAlerts(): Promise<PriceAlert[]> {
  try {
    const data = await fs.readFile(ALERTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveAlerts(alerts: PriceAlert[]): Promise<void> {
  await fs.mkdir(path.dirname(ALERTS_FILE), { recursive: true });
  await fs.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2));
}

function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSetAlertTool(): AnyAgentTool {
  return {
    name: "setAlert",
    label: "Set Alert",
    description: "设置价格提醒（止盈/止损）",
    parameters: SetAlertSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, condition, price, message } = params as {
        symbol: string;
        condition: "above" | "below";
        price: number;
        message?: string;
      };

      try {
        const alerts = await loadAlerts();

        const newAlert: PriceAlert = {
          id: generateId(),
          symbol,
          condition,
          price,
          message:
            message ||
            `${symbol} ${condition === "above" ? "上涨至" : "下跌至"} ${price}`,
          createdAt: new Date().toISOString(),
          triggered: false,
        };

        alerts.push(newAlert);
        await saveAlerts(alerts);

        return toToolResult({
          content: [
            "✅ 价格提醒已设置",
            "",
            `**标的**: ${symbol}`,
            `**条件**: ${condition === "above" ? "≥" : "≤"} ${price}`,
            `**提醒内容**: ${newAlert.message}`,
            `**ID**: ${newAlert.id}`,
            "",
            "提醒将在 Gateway 的价格检查周期（默认 5 分钟）内被监控。",
          ].join("\n"),
        });
      } catch (error) {
        return toToolResult({
          content: `设置提醒失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
