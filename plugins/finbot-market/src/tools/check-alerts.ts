import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";
import { fetchQuote } from "./market-query.js";
import * as fs from "fs/promises";
import * as path from "path";

const CheckAlertsSchema = {
  type: "object" as const,
  properties: {
    dryRun: {
      type: "boolean" as const,
      description: "仅预览触发状态，不修改提醒记录",
    },
  },
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

function isTriggered(alert: PriceAlert, currentPrice: number): boolean {
  if (alert.condition === "above") return currentPrice >= alert.price;
  return currentPrice <= alert.price;
}

export function createCheckAlertsTool(): AnyAgentTool {
  return {
    name: "checkAlerts",
    label: "Check Alerts",
    description:
      "扫描所有价格提醒，检查当前行情是否满足触发条件。建议通过 OpenClaw cron 或 heartbeat 每 5 分钟调用一次。",
    parameters: CheckAlertsSchema,
    execute: async (_toolCallId, params) => {
      const { dryRun = false } = params as { dryRun?: boolean };

      try {
        const alerts = await loadAlerts();
        const pending = alerts.filter((a) => !a.triggered);

        if (pending.length === 0) {
          return toToolResult({ content: "没有待检查的价格提醒。" });
        }

        const triggered: Array<{ alert: PriceAlert; price: number }> = [];
        const errors: Array<{ alert: PriceAlert; error: string }> = [];

        for (const alert of pending) {
          try {
            const quote = await fetchQuote(alert.symbol);
            if (isTriggered(alert, quote.price)) {
              triggered.push({ alert, price: quote.price });
            }
          } catch (e) {
            errors.push({
              alert,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        if (!dryRun && triggered.length > 0) {
          for (const t of triggered) {
            const idx = alerts.findIndex((a) => a.id === t.alert.id);
            if (idx >= 0) alerts[idx].triggered = true;
          }
          await saveAlerts(alerts);
        }

        const lines: string[] = [
          `🔔 价格提醒扫描结果 (${pending.length} 条待检查)`,
          "",
        ];

        if (triggered.length > 0) {
          lines.push(`**已触发 (${triggered.length} 条)**:`);
          for (const t of triggered) {
            const action = t.alert.condition === "above" ? "上涨至" : "下跌至";
            lines.push(
              `- ${t.alert.symbol}: ${action} ${t.price}（目标 ${t.alert.price}）`,
            );
            lines.push(`  ${t.alert.message}`);
          }
          lines.push("");
        }

        if (errors.length > 0) {
          lines.push(`**查询失败 (${errors.length} 条)**:`);
          for (const e of errors) {
            lines.push(`- ${e.alert.symbol}: ${e.error}`);
          }
          lines.push("");
        }

        const untouched =
          pending.length - triggered.length - errors.length;
        if (untouched > 0) {
          lines.push(`**未触发 (${untouched} 条)** — 条件尚未满足`);
          lines.push("");
        }

        lines.push("⚠️ 价格提醒仅供参考，不构成投资建议");

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `扫描提醒失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
