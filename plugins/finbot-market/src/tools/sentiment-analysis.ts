import type { AnyAgentTool } from "../types.js";
import { toToolResult } from "../types.js";

const SentimentAnalysisSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "股票/ETF 代码，如 600519.SH、00700.HK、AAPL、BTC-USD",
    },
    keyword: {
      type: "string" as const,
      description: "主题关键词，如 人工智能、黄金",
    },
  },
};

interface NewsItem {
  title: string;
  sentiment: "正面" | "中性" | "负面";
  source: string;
  date: string;
}

const POSITIVE_KEYWORDS = [
  "增长", "上涨", "利好", "突破", "超预期", "盈利", "复苏", "强劲",
  "增持", "买入", "升", "新高", "改善", "扩张", "景气", "乐观",
];

const NEGATIVE_KEYWORDS = [
  "下跌", "下滑", "亏损", "下调", "减持", "卖出", "风险", "暴雷",
  "警示", "处罚", "负面", "降", "跌", "衰退", "萎缩", "悲观",
  "差评", "违约", "裁员", "暴亏",
];

export function classifySentiment(title: string): "正面" | "中性" | "负面" {
  const text = title.toLowerCase();
  let posScore = 0;
  let negScore = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) posScore++;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) negScore++;
  }

  if (posScore > negScore) return "正面";
  if (negScore > posScore) return "负面";
  return "中性";
}

function classifyByAvScore(score: number): "正面" | "中性" | "负面" {
  if (score >= 0.35) return "正面";
  if (score <= -0.35) return "负面";
  return "中性";
}

type MarketType = "a" | "hk" | "us" | "other";

function detectMarketType(symbol: string): MarketType {
  if (/^\d{6}\.(SZ|SH|BJ)$/i.test(symbol) || /^\d{6}$/.test(symbol)) return "a";
  if (/^\d{1,5}\.HK$/i.test(symbol)) return "hk";
  if (/^[A-Z]{1,5}$/.test(symbol) || /^[A-Z]{1,5}-USD$/i.test(symbol)) return "us";
  return "other";
}

function extractStockCode(symbol: string): { code: string; marketId: string } | null {
  const m = symbol.match(/(\d{6})\.(SZ|SH|BJ)/);
  if (m) {
    const [, code, exchange] = m;
    return { code, marketId: exchange === "SH" ? "1" : "0" };
  }
  const bare = symbol.match(/^(\d{6})$/);
  if (bare) {
    return { code: bare[1], marketId: "1" };
  }
  return null;
}

function extractHkCode(symbol: string): string | null {
  const m = symbol.match(/^(\d{1,5})\.HK$/i);
  if (m) return m[1];
  return null;
}

async function fetchNewsBySymbol(symbol: string): Promise<NewsItem[]> {
  const market = detectMarketType(symbol);

  if (market === "a") {
    return fetchCnNewsBySymbol(symbol);
  }
  if (market === "hk") {
    return fetchHkNewsBySymbol(symbol);
  }
  return fetchUsNewsBySymbol(symbol);
}

async function fetchCnNewsBySymbol(symbol: string): Promise<NewsItem[]> {
  const info = extractStockCode(symbol);
  if (!info) {
    throw new Error("仅支持 A 股 6 位数字代码格式");
  }

  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?page_size=10&page_index=1&ann_type=A&stock_list=${info.code}&f_node=0&s_node=0`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const list: Array<{
    title_ch: string;
    notice_date: string;
    codes: Array<{ short_name: string }>;
  }> = json.data?.list ?? [];

  return list.slice(0, 8).map((item) => ({
    title: item.title_ch,
    sentiment: classifySentiment(item.title_ch),
    source: item.codes?.[0]?.short_name ?? "东方财富",
    date: item.notice_date?.split(" ")[0] ?? "",
  }));
}

async function fetchHkNewsBySymbol(symbol: string): Promise<NewsItem[]> {
  const code = extractHkCode(symbol);
  if (!code) {
    throw new Error("港股代码格式错误，应为 00700.HK 格式");
  }

  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?page_size=10&page_index=1&ann_type=H&stock_list=${code}&f_node=0&s_node=0`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const list: Array<{
    title_ch: string;
    notice_date: string;
    codes: Array<{ short_name: string }>;
  }> = json.data?.list ?? [];

  if (list.length === 0) {
    throw new Error("未能获取到港股公告");
  }

  return list.slice(0, 8).map((item) => ({
    title: item.title_ch,
    sentiment: classifySentiment(item.title_ch),
    source: item.codes?.[0]?.short_name ?? "东方财富",
    date: item.notice_date?.split(" ")[0] ?? "",
  }));
}

async function fetchUsNewsBySymbol(symbol: string): Promise<NewsItem[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error("未配置 ALPHA_VANTAGE_API_KEY，无法获取美股/加密货币新闻");
  }

  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=10&apikey=${apiKey}`;

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
    overall_sentiment_score: number;
  }> = json.feed ?? [];

  if (feed.length === 0) {
    throw new Error("未找到相关新闻");
  }

  return feed.slice(0, 8).map((item) => ({
    title: item.title,
    sentiment: classifyByAvScore(Number(item.overall_sentiment_score ?? 0)),
    source: item.source,
    date: item.time_published?.slice(0, 10) ?? "",
  }));
}

async function fetchNewsByKeyword(keyword: string): Promise<NewsItem[]> {
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&count=10`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  const json = await response.json();

  const list: Array<{
    Title: string;
    Url: string;
    Art_Time: string;
  }> = json.QuotationCodeTable?.Data ?? [];

  return list.slice(0, 8).map((item) => ({
    title: item.Title,
    sentiment: classifySentiment(item.Title),
    source: "东方财富",
    date: item.Art_Time?.split(" ")[0] ?? "",
  }));
}

export function formatSentimentOutput(
  symbol: string | null,
  keyword: string | null,
  news: NewsItem[],
): string {
  const name = symbol && keyword
    ? `${keyword}(${symbol})`
    : symbol ?? keyword ?? "未知标的";

  if (news.length === 0) {
    return `📰 ${name} 舆情概览\n\n未能获取到相关新闻。\n\n⚠️ 不构成投资建议`;
  }

  const counts = { 正面: 0, 中性: 0, 负面: 0 };
  for (const n of news) counts[n.sentiment]++;

  let sentimentLabel = "中性";
  if (counts.正面 > counts.负面) sentimentLabel = "偏正面";
  if (counts.负面 > counts.正面) sentimentLabel = "偏负面";

  const lines: string[] = [
    `📰 ${name} 舆情概览`,
    "",
    "**最新动态**:",
  ];

  for (let i = 0; i < news.length; i++) {
    const n = news[i];
    lines.push(`  ${i + 1}. [${n.sentiment}] ${n.title}  (${n.source} ${n.date})`);
  }

  lines.push(
    "",
    `**情绪判断**: ${sentimentLabel}（正面${counts.正面}条 / 中性${counts.中性}条 / 负面${counts.负面}条）`,
    "",
    "⚠️ 不构成投资建议",
  );

  return lines.join("\n");
}

export function createSentimentAnalysisTool(): AnyAgentTool {
  return {
    name: "sentimentAnalysis",
    label: "Sentiment Analysis",
    description: "舆情分析：获取股票/主题的最新新闻并进行情绪判断。支持 A股(600519.SH)、港股(00700.HK)、美股(AAPL)、加密货币(BTC-USD) 及关键词查询",
    parameters: SentimentAnalysisSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, keyword } = params as {
        symbol?: string;
        keyword?: string;
      };

      if (!symbol && !keyword) {
        return toToolResult({
          content: "请至少提供 symbol（股票代码）或 keyword（关键词）之一",
          isError: true,
        });
      }

      try {
        let news: NewsItem[];
        if (symbol) {
          news = await fetchNewsBySymbol(symbol).catch(() => []);
        } else {
          news = await fetchNewsByKeyword(keyword!).catch(() => []);
        }

        if (news.length === 0) {
          return toToolResult({
            content: `未能获取到 ${symbol ?? keyword} 的相关新闻，请稍后重试`,
            isError: true,
          });
        }

        const output = formatSentimentOutput(symbol ?? null, keyword ?? null, news);
        return toToolResult({ content: output });
      } catch (error) {
        return toToolResult({
          content: `舆情分析失败: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        });
      }
    },
  };
}
