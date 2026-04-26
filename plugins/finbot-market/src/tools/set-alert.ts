import { ToolContext, ToolResult } from "../types";
import * as fs from "fs/promises";
import * as path from "path";

interface SetAlertArgs {
  symbol: string;
  condition: "above" | "below";
  price: number;
  message?: string;
}

interface PriceAlert {
  id: string;
  symbol: string;
  condition: "above" | "below";
  price: number;
  message: string;
  createdAt: string;
  triggered: boolean;
}

const ALERTS_FILE = path.join(process.env.HOME || "", ".openclaw", "finbot-alerts.json");

export async function setAlert(
  args: SetAlertArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { symbol, condition, price, message } = args;

  try {
    // 读取现有提醒
    const alerts = await loadAlerts();

    // 创建新提醒
    const newAlert: PriceAlert = {
      id: generateId(),
      symbol,
      condition,
      price,
      message: message || `${symbol} ${condition === "above" ? "上涨至" : "下跌至"} ${price}`,
      createdAt: new Date().toISOString(),
      triggered: false,
    };

    alerts.push(newAlert);

    // 保存
    await saveAlerts(alerts);

    return {
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
    };
  } catch (error) {
    return {
      content: `设置提醒失败: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

async function loadAlerts(): Promise<PriceAlert[]> {
  try {
    const data = await fs.readFile(ALERTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    // 文件不存在时返回空数组
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
