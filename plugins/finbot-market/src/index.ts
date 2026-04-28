import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createMarketQueryTool } from "./tools/market-query.js";
import { createPortfolioAnalysisTool } from "./tools/portfolio-analysis.js";
import { createRiskAssessmentTool } from "./tools/risk-assessment.js";
import { createNewsFetchTool } from "./tools/news-fetch.js";
import { createSetAlertTool } from "./tools/set-alert.js";
import { createTechnicalAnalysisTool } from "./tools/technical-analysis.js";
import { createFundamentalAnalysisTool } from "./tools/fundamental-analysis.js";

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
  },
});
