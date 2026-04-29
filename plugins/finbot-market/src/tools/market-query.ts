import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const MarketQuerySchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "标的代码，如 000001.SZ、00700.HK、AAPL、BTC-USD",
    },
    market: {
      type: "string" as const,
      enum: ["A股", "港股", "美股", "crypto"],
      description: "市场类型（可选，自动识别）",
    },
  },
  required: ["symbol"],
};

export function detectMarket(symbol: string): string {
  if (symbol.includes("-USD") || symbol.includes("-USDT")) return "crypto";
  if (symbol.endsWith(".HK")) return "港股";
  if (/\d{6}\.(SZ|SH|BJ)/.test(symbol)) return "A股";
  return "美股";
}

function toEastMoneySecid(symbol: string, market: string): string {
  if (market === "A股") {
    const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
    if (!m) throw new Error(`无效 A 股代码: ${symbol}`);
    const [, code, exchange] = m;
    const marketId = exchange === "SH" ? 1 : 0;
    return `${marketId}.${code}`;
  }
  if (market === "港股") {
    const code = symbol.replace(".HK", "").padStart(5, "0");
    return `116.${code}`;
  }
  throw new Error(`东方财富不支持 ${market} 市场`);
}

export interface NormalizedQuote {
  price: number;
  change: number;
  changePercent: string;
  volume: number;
  latestTradingDay: string;
}

export async function fetchQuote(
  symbol: string,
  market?: string,
): Promise<NormalizedQuote> {
  const detectedMarket = market || detectMarket(symbol);
  if (detectedMarket === "crypto") {
    return fetchCryptoPrice(symbol);
  } else if (detectedMarket === "A股" || detectedMarket === "港股") {
    return fetchEastMoneyQuote(symbol, detectedMarket);
  } else {
    return fetchAlphaVantageQuote(symbol);
  }
}

async function fetchEastMoneyQuote(
  symbol: string,
  market: string,
): Promise<NormalizedQuote> {
  const secid = toEastMoneySecid(symbol, market);
  const fields = "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`;

  const response = await fetch(url);
  const json = await response.json();

  if (json.rc !== 0 || !json.data) {
    throw new Error("东方财富接口返回异常");
  }

  const d = json.data;
  const divisor = market === "港股" ? 1000 : 100;

  const price = d.f43 / divisor;
  const prevClose = d.f60 / divisor;
  const change = +(price - prevClose).toFixed(divisor === 1000 ? 3 : 2);
  const changePercent = (d.f170 / 100).toFixed(2) + "%";

  return {
    price,
    change,
    changePercent,
    volume: d.f47,
    latestTradingDay: new Date().toISOString().split("T")[0],
  };
}

async function fetchAlphaVantageQuote(symbol: string): Promise<NormalizedQuote> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY not configured");

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  const quote = data["Global Quote"];
  if (!quote || Object.keys(quote).length === 0) {
    throw new Error("No data found for symbol");
  }

  return {
    price: parseFloat(quote["05. price"]),
    change: parseFloat(quote["09. change"]),
    changePercent: quote["10. change percent"],
    volume: parseInt(quote["06. volume"]),
    latestTradingDay: quote["07. latest trading day"],
  };
}

async function fetchCryptoPrice(symbol: string): Promise<NormalizedQuote> {
  const coinId = symbol.toLowerCase().replace("-usd", "").replace("-usdt", "");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;

  const response = await fetch(url);
  const data = await response.json();

  const coinData = data[coinId];
  if (!coinData) throw new Error("Cryptocurrency not found");

  return {
    price: coinData.usd,
    change: 0,
    changePercent: `${coinData.usd_24h_change?.toFixed(2)}%`,
    volume: coinData.usd_24h_vol,
    latestTradingDay: new Date().toISOString().split("T")[0],
  };
}

function formatQuote(symbol: string, market: string, data: NormalizedQuote): string {
  const changeSign = data.change >= 0 ? "+" : "";
  const changeEmoji = data.change >= 0 ? "🟢" : "🔴";

  return [
    `${changeEmoji} ${symbol} (${market})`,
    ``,
    `**价格**: ${data.price}`,
    `**涨跌**: ${changeSign}${data.change} (${data.changePercent})`,
    `**成交量**: ${data.volume?.toLocaleString() ?? "N/A"}`,
    `**更新时间**: ${data.latestTradingDay}`,
    ``,
    `⚠️ 不构成投资建议`,
  ].join("\n");
}

export function createMarketQueryTool(): AnyAgentTool {
  return {
    name: "marketQuery",
    label: "Market Query",
    description:
      "查询股票、基金、加密货币的实时行情。支持 A股(000001.SZ)、港股(00700.HK)、美股(AAPL)、加密货币(BTC-USD)",
    parameters: MarketQuerySchema,
    execute: async (_toolCallId, params) => {
      const { symbol, market } = params as { symbol: string; market?: string };
      const detectedMarket = market || detectMarket(symbol);

      try {
        const data = await fetchQuote(symbol, market);
        return toToolResult({ content: formatQuote(symbol, detectedMarket, data) });
      } catch (error) {
        return toToolResult({
          content: `查询 ${symbol} 失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
