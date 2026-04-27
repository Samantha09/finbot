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

async function fetchMockNews(
  symbol: string,
  limit: number,
): Promise<NewsItem[]> {
  return [
    {
      title: `${symbol} 发布最新季度财报`,
      source: "财经网",
      url: "#",
      publishedAt: "2026-04-25",
      summary:
        "营收同比增长 15%，超出市场预期。管理层维持全年业绩指引不变。",
    },
    {
      title: `机构上调 ${symbol} 目标价`,
      source: "投资日报",
      url: "#",
      publishedAt: "2026-04-24",
      summary:
        "多家券商发布研报，认为当前估值具有吸引力，平均目标价上调 12%。",
    },
  ].slice(0, limit);
}

export function createNewsFetchTool(): AnyAgentTool {
  return {
    name: "newsFetch",
    label: "News Fetch",
    description: "获取标的相关的最新财经新闻",
    parameters: NewsFetchSchema,
    execute: async (_toolCallId, params) => {
      const { symbol, limit = 5 } = params as {
        symbol: string;
        limit?: number;
      };

      try {
        const news = await fetchMockNews(symbol, limit);

        if (news.length === 0) {
          return toToolResult({ content: `未找到 ${symbol} 的相关新闻。` });
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
