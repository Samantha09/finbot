import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const NewsFetchSchema = {
  type: "object" as const,
  properties: {
    symbol: { type: "string" as const },
    limit: { type: "number" as const, default: 5 },
  },
  required: ["symbol"],
};

interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
}

function extractStockCode(symbol: string): { code: string; marketId: string } | null {
  const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
  if (!m) return null;
  const [, code, exchange] = m;
  return { code, marketId: exchange === "SH" ? "1" : "0" };
}

async function fetchEastMoneyAnnouncements(
  symbol: string,
  limit: number,
): Promise<NewsItem[]> {
  const info = extractStockCode(symbol);
  if (!info) return [];

  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?page_size=${limit}&page_index=1&ann_type=A&stock_list=${info.code}&f_node=0&s_node=0`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const list: Array<{
    title_ch: string;
    notice_date: string;
    art_code: string;
    codes: Array<{ short_name: string }>;
  }> = json.data?.list ?? [];

  return list.map((item) => ({
    title: item.title_ch,
    source: item.codes?.[0]?.short_name ?? "东方财富",
    url: `https://data.eastmoney.com/notices/detail/${info.code}/${item.art_code}.html`,
    publishedAt: item.notice_date?.split(" ")[0] ?? "",
    summary: item.title_ch,
  }));
}

async function fetchAlphaVantageNews(
  symbol: string,
  limit: number,
): Promise<NewsItem[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return [];

  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const feed: Array<{
    title: string;
    source: string;
    url: string;
    time_published: string;
    summary: string;
  }> = json.feed ?? [];

  return feed.map((item) => ({
    title: item.title,
    source: item.source,
    url: item.url,
    publishedAt: item.time_published?.slice(0, 10) ?? "",
    summary: item.summary?.slice(0, 120) ?? "",
  }));
}

export function createNewsFetchTool(): AnyAgentTool {
  return {
    name: "newsFetch",
    label: "News Fetch",
    description: "获取标的相关的最新财经新闻。A股/港股走东方财富公告，美股/crypto 走 Alpha Vantage",
    parameters: NewsFetchSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, limit = 5 } = params as {
        symbol: string;
        limit?: number;
      };

      try {
        const isCnStock = /\d{6}\.(SZ|SH|BJ)/.test(symbol);
        const isHK = symbol.endsWith(".HK");

        let news: NewsItem[];

        if (isCnStock || isHK) {
          news = await fetchEastMoneyAnnouncements(symbol, limit);
        } else {
          const avNews = await fetchAlphaVantageNews(symbol, limit);
          if (avNews.length === 0) {
            return toToolResult({
              content:
                `未找到 ${symbol} 的相关新闻。请确认 ALPHA_VANTAGE_API_KEY 已配置以获取美股/加密货币新闻。`,
            });
          }
          news = avNews;
        }

        if (news.length === 0) {
          return toToolResult({ content: `未找到 ${symbol} 的相关新闻。` });
        }

        const lines = [
          `📰 ${symbol} 相关新闻 (${news.length} 条)`,
          "",
          ...news.flatMap((item, idx) => [
            `${idx + 1}. **${item.title}**`,
            `   来源: ${item.source} | ${item.publishedAt}`,
            item.summary !== item.title ? `   ${item.summary}` : null,
            "",
          ]),
          "⚠️ 新闻仅供参考，不构成投资建议",
        ].filter((line): line is string => line !== null);

        return toToolResult({ content: lines.join("\n") });
      } catch (error) {
        return toToolResult({
          content: `获取新闻失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
