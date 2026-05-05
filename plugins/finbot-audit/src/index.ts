import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { AnyAgentTool } from "./types.js";
import { withAudit, readAuditLogs, formatAuditReport } from "./audit.js";

export { withAudit, readAuditLogs, formatAuditReport };
export type { AnyAgentTool, AuditOptions, AuditLogEntry } from "./types.js";

export default definePluginEntry({
  id: "finbot-audit",
  name: "FinBot Audit",
  description: "FinBot 工具调用审计日志插件，记录每次 tool 执行的入参、出参、耗时和状态",
  register(api) {
    const originalRegisterTool = api.registerTool.bind(api);

    // 注册审计查询工具（跳过 audit 包装，避免递归）
    const auditReportTool: AnyAgentTool = {
      name: "auditReport",
      label: "审计报告",
      description: "查询指定日期的工具调用审计日志，返回格式化报告。支持按工具名、状态过滤。",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "日期 (YYYY-MM-DD)，默认今天" },
          tool: { type: "string", description: "按工具名过滤" },
          status: { type: "string", enum: ["success", "error"], description: "按状态过滤" },
          limit: { type: "number", description: "最多返回条数，默认 50" },
        },
      },
      execute: async (_id, params) => {
        const p = params as Record<string, unknown>;
        const report = await readAuditLogs({
          date: typeof p.date === "string" ? p.date : undefined,
          tool: typeof p.tool === "string" ? p.tool : undefined,
          status: p.status === "success" || p.status === "error" ? p.status : undefined,
          limit: typeof p.limit === "number" ? p.limit : undefined,
        });
        const date = typeof p.date === "string" ? p.date : new Date().toISOString().slice(0, 10);
        const text = formatAuditReport(report, date);
        return { content: [{ type: "text", text }], details: report };
      },
    };
    originalRegisterTool(auditReportTool);

    // Monkey-patch registerTool，让后续插件的工具自动被审计
    api.registerTool = (tool, opts?) => {
      if (typeof tool === "function") {
        originalRegisterTool(tool, opts);
      } else {
        originalRegisterTool(withAudit(tool, "finbot-market"), opts);
      }
    };
  },
});
