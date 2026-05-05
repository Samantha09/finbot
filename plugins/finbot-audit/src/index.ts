import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { AnyAgentTool } from "./types.js";
import { withAudit } from "./audit.js";

export { withAudit };
export type { AnyAgentTool, AuditOptions, AuditLogEntry } from "./types.js";

export default definePluginEntry({
  id: "finbot-audit",
  name: "FinBot Audit",
  description: "FinBot 工具调用审计日志插件，记录每次 tool 执行的入参、出参、耗时和状态",
  register(api) {
    const originalRegisterTool = api.registerTool.bind(api);
    api.registerTool = (tool, opts?) => {
      if (typeof tool === "function") {
        originalRegisterTool(tool, opts);
      } else {
        originalRegisterTool(withAudit(tool, "finbot-market"), opts);
      }
    };
  },
});
