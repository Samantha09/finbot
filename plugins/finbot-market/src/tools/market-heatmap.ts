import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const MarketHeatmapSchema = {
  type: "object" as const,
  properties: {
    market: {
      type: "string" as const,
      enum: ["A股", "港股"],
      description: "市场，默认 A股",
    },
  },
};

interface SectorData {
  name: string;
  changePercent: number;
  netInflow: number;
}

function formatBillionYuan(yuan: number): string {
  const billion = yuan / 1e8;
  const sign = billion >= 0 ? "+" : "";
  return `${sign}${billion.toFixed(1)}亿`;
}

function getSectorFieldSet(market: string): string {
  if (market === "港股") {
    return "m:128+t:3";
  }
  return "m:90+t:2";
}

async function fetchSectorData(market: string): Promise<SectorData[]> {
  const fs = getSectorFieldSet(market);
  const fields = "f12,f14,f3,f62";
  const url = `https://push2.eastmoney.com/api/qt/clist/get?fs=${fs}&fields=${fields}&_=${Date.now()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const diff: Array<{
    f14: string;
    f3: number | null;
    f62: number | null;
  }> = json.data?.diff ?? [];

  if (!Array.isArray(diff) || diff.length === 0) {
    throw new Error("行业数据为空");
  }

  return diff
    .filter((d) => d.f14 && d.f3 !== null && d.f3 !== undefined)
    .map((d) => ({
      name: String(d.f14),
      changePercent: Number(d.f3) / 100,
      netInflow: Number(d.f62 ?? 0),
    }));
}

export function formatHeatmapOutput(
  market: string,
  sectors: SectorData[],
): string {
  if (sectors.length === 0) {
    return `📊 ${market} 行业热力图\n\n未能获取到行业数据。\n\n⚠️ 不构成投资建议`;
  }

  const sorted = [...sectors].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter((s) => s.changePercent > 0);
  const losers = sorted.filter((s) => s.changePercent < 0);
  const dateStr = new Date().toLocaleDateString("zh-CN");

  const lines: string[] = [
    `📊 ${market} 行业热力图（${dateStr}）`,
    "",
  ];

  if (gainers.length > 0) {
    lines.push("**领涨行业**:");
    for (const s of gainers.slice(0, 5)) {
      const inflowText = s.netInflow >= 0
        ? `主力净流入 +${formatBillionYuan(s.netInflow).slice(1)}`
        : `主力净流出 ${formatBillionYuan(s.netInflow)}`;
      lines.push(`  ${s.name} +${s.changePercent.toFixed(2)}%  ${inflowText}`);
    }
    lines.push("");
  }

  if (losers.length > 0) {
    lines.push("**领跌行业**:");
    for (const s of losers.slice(-5).reverse()) {
      const inflowText = s.netInflow >= 0
        ? `主力净流入 +${formatBillionYuan(s.netInflow).slice(1)}`
        : `主力净流出 ${formatBillionYuan(s.netInflow)}`;
      lines.push(`  ${s.name} ${s.changePercent.toFixed(2)}%  ${inflowText}`);
    }
    lines.push("");
  }

  lines.push("⚠️ 不构成投资建议");
  return lines.join("\n");
}

export function createMarketHeatmapTool(): AnyAgentTool {
  return {
    name: "marketHeatmap",
    label: "Market Heatmap",
    description: "大盘热力图：展示 A股/港股 各行业涨跌幅及主力资金流向",
    parameters: MarketHeatmapSchema,
    execute: async (_toolCallId, params) => {
      const market = (params as { market?: string }).market ?? "A股";

      try {
        const sectors = await fetchSectorData(market).catch(() => []);

        if (sectors.length === 0) {
          return toToolResult({
            content: `${market} 行业数据获取失败，请稍后重试`,
            isError: true,
          });
        }

        const output = formatHeatmapOutput(market, sectors);
        return toToolResult({ content: output });
      } catch (error) {
        return toToolResult({
          content: `热力图获取失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
