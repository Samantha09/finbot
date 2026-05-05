import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { GuardOptions } from "./types.js";
import { scoreToolParams, sanitizeToolResult } from "./guard.js";

export { scoreToolParams, sanitizeToolResult };
export type { GuardOptions, RiskScore, RiskLevel, SanitizeRule } from "./types.js";

export default definePluginEntry({
  id: "finbot-guard",
  name: "FinBot Guard",
  description: "FinBot 风险评分与结果脱敏插件，在工具调用前进行参数风险评分，在结果返回前对敏感信息进行脱敏",
  register(api) {
    // A) before_tool_call hook — 风险评分
    (api as any).on("before_tool_call", async (event: {
      runId?: string;
      toolCallId?: string;
      toolName: string;
      params: Record<string, unknown>;
    }) => {
      const pluginConfig = (api as any).pluginConfig || {};
      const score = scoreToolParams(event.toolName, event.params, pluginConfig as GuardOptions);

      if (score.level !== "low") {
        // 如果 api 支持 setRunContext，则存储评分供后续使用
        if (typeof (api as any).setRunContext === "function") {
          (api as any).setRunContext({
            runId: event.runId || "default",
            namespace: "finbot-guard",
            patch: {
              [`${event.toolCallId || event.toolName}`]: {
                score: score.score,
                level: score.level,
                reasons: score.reasons,
              },
            },
          });
        }
      }

      // 不拦截，只记录评分
      return undefined;
    });

    // B) AgentToolResultMiddleware — 脱敏
    (api as any).registerAgentToolResultMiddleware(async (event: {
      result: {
        content: Array<{ type: string; text: string }>;
        details: Record<string, unknown>;
      };
    }) => {
      const pluginConfig = (api as any).pluginConfig || {};
      const sanitized = sanitizeToolResult(event.result, pluginConfig as GuardOptions);
      return { result: sanitized };
    });
  },
});
