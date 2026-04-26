import { ToolContext, ToolResult } from "../types";

interface NewsFetchArgs {
  symbol: string;
  limit?: number;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
}

export async function newsFetch(
  args: NewsFetchArgs,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { symbol, limit = 5 } = args;

  try {
    // 实际生产环境应接入 NewsAPI、Bloomberg API 或 RSS 源
    // 此处为简化实现，使用模拟数据演示结构
    const news = await fetchMockNews(symbol, limit);

    if (news.length === 0) {
      return { content: `未找到 ${symbol} 的相关新闻。` };
    }

    const lines = [
      `📰 ${symbol} 相关新闻 (${news.length} 条)`,
      "",
      ...news.flatMap((item, idx) => [
        `${idx + 1}. **${item.title}**`,
        `   来源: ${item.source} | ${item.publishedAt}`,
        `   ${item.summary}`,
        "",
      ]),
      "⚠️ 新闻仅供参考，不构成投资建议",
    ];

    return { content: lines.join("\n") };
  } catch (error) {
    return {
      content: `获取新闻失败: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

async function fetchMockNews(symbol: string, limit: number): Promise<NewsItem[]> {
  // TODO: 替换为真实的新闻 API 调用
  // 示例: NewsAPI (https://newsapi.org/)
  // const apiKey = process.env.NEWS_API_KEY;
  // const url = `https://newsapi.org/v2/everything?q=${symbol}&sortBy=publishedAt&pageSize=${limit}&apiKey=${apiKey}`;

  // 返回模拟数据用于演示
  return [
    {
      title: `${symbol} 发布最新季度财报`,
      source: "财经网",
      url: "#",
      publishedAt: "2026-04-25",
      summary: "营收同比增长 15%，超出市场预期。管理层维持全年业绩指引不变。",
    },
    {
      title: `机构上调 ${symbol} 目标价`,
      source: "投资日报",
      url: "#",
      publishedAt: "2026-04-24",
      summary: "多家券商发布研报，认为当前估值具有吸引力，平均目标价上调 12%。",
    },
  ].slice(0, limit);
}
