import { ToolContext, ToolResult } from "openclaw/plugin-sdk";

interface MarketQueryArgs {
  symbol: string;
  market?: string;
}

export async function marketQuery(args: MarketQueryArgs, ctx: ToolContext): Promise<ToolResult> {
  const { symbol } = args;

  // 自动识别市场
  const market = args.market || detectMarket(symbol);

  try {
    let data: any;

    if (market === "crypto") {
      data = await fetchCryptoPrice(symbol);
    } else {
      data = await fetchStockPrice(symbol);
    }

    return {
      content: formatQuote(symbol, market, data),
    };
  } catch (error) {
    return {
      content: `查询 ${symbol} 失败: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

function detectMarket(symbol: string): string {
  if (symbol.includes("-USD") || symbol.includes("-USDT")) return "crypto";
  if (symbol.endsWith(".HK")) return "港股";
  if (/\d{6}\.(SZ|SH|BJ)/.test(symbol)) return "A股";
  return "美股";
}

async function fetchStockPrice(symbol: string): Promise<any> {
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

async function fetchCryptoPrice(symbol: string): Promise<any> {
  const coinId = symbol.toLowerCase().replace("-usd", "").replace("-usdt", "");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;

  const response = await fetch(url);
  const data = await response.json();

  const coinData = data[coinId];
  if (!coinData) throw new Error("Cryptocurrency not found");

  return {
    price: coinData.usd,
    changePercent: `${coinData.usd_24h_change?.toFixed(2)}%`,
    volume: coinData.usd_24h_vol,
    latestTradingDay: new Date().toISOString().split("T")[0],
  };
}

function formatQuote(symbol: string, market: string, data: any): string {
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
