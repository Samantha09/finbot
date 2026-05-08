import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createMarketQueryTool } from "./tools/market-query.js";
import { createPortfolioAnalysisTool } from "./tools/portfolio-analysis.js";
import { createRiskAssessmentTool } from "./tools/risk-assessment.js";
import { createNewsFetchTool } from "./tools/news-fetch.js";
import { createSetAlertTool } from "./tools/set-alert.js";
import { createTechnicalAnalysisTool } from "./tools/technical-analysis.js";
import { createFundamentalAnalysisTool } from "./tools/fundamental-analysis.js";
import { createStrategyBacktestTool } from "./tools/strategy-backtest.js";
import { createCheckAlertsTool } from "./tools/check-alerts.js";
import { createEtfAnalysisTool } from "./tools/etf-analysis.js";
import { createMacroAnalysisTool } from "./tools/macro-analysis.js";
import { createSentimentAnalysisTool } from "./tools/sentiment-analysis.js";
import { createMarketHeatmapTool } from "./tools/market-heatmap.js";
import { createGfEtfSearchTool } from "./tools/gf-etf-search.js";
import { createGfEtfSuperFundTool } from "./tools/gf-etf-super-fund.js";
import { createGfEtfRankTool } from "./tools/gf-etf-rank.js";
import { createGfStockF10Tool } from "./tools/gf-stock-f10.js";

export default definePluginEntry({
  id: "finbot-market",
  name: "FinBot Market",
  description: "FinBot 金融数据查询与分析插件",
  register(api) {
    api.registerTool(createMarketQueryTool());
    api.registerTool(createPortfolioAnalysisTool());
    api.registerTool(createRiskAssessmentTool());
    api.registerTool(createNewsFetchTool());
    api.registerTool(createSetAlertTool());
    api.registerTool(createTechnicalAnalysisTool());
    api.registerTool(createFundamentalAnalysisTool());
    api.registerTool(createStrategyBacktestTool());
    api.registerTool(createCheckAlertsTool());
    api.registerTool(createEtfAnalysisTool());
    api.registerTool(createMacroAnalysisTool());
    api.registerTool(createSentimentAnalysisTool());
    api.registerTool(createMarketHeatmapTool());
    api.registerTool(createGfEtfSearchTool());
    api.registerTool(createGfEtfSuperFundTool());
    api.registerTool(createGfEtfRankTool());
    api.registerTool(createGfStockF10Tool());
  },
});
