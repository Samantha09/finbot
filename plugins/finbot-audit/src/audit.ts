import * as fs from "fs/promises";
import * as path from "path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AnyAgentTool, AuditLogEntry, AuditOptions } from "./types.js";

const DEFAULT_OPTIONS: Required<AuditOptions> = {
  logDir: path.join(process.env.HOME || "/tmp", ".openclaw", "audit-logs"),
  maxInputLength: 200,
  maxOutputLength: 500,
  asyncFlush: false,
};

function getLogFilePath(logDir: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logDir, `${date}.jsonl`);
}

function sanitize(value: unknown, maxLength: number): string {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...[truncated]";
  } catch {
    return "[unserializable]";
  }
}

async function writeLog(entry: AuditLogEntry, logDir: string): Promise<void> {
  try {
    await fs.mkdir(logDir, { recursive: true });
    const filePath = getLogFilePath(logDir);
    const line = JSON.stringify(entry) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  } catch (err) {
    console.error("[finbot-audit] write failed:", err);
  }
}

export interface AuditQueryParams {
  date?: string;
  tool?: string;
  status?: "success" | "error";
  limit?: number;
}

export interface AuditReport {
  total: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  entries: AuditLogEntry[];
}

export async function readAuditLogs(
  params: AuditQueryParams,
  options?: AuditOptions,
): Promise<AuditReport> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const date = params.date || new Date().toISOString().slice(0, 10);
  const filePath = path.join(opts.logDir, `${date}.jsonl`);

  let entries: AuditLogEntry[] = [];
  try {
    const content = await fs.readFile(filePath, "utf-8");
    entries = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    // file not found or unreadable
  }

  if (params.tool) {
    entries = entries.filter((e) => e.tool === params.tool);
  }
  if (params.status) {
    entries = entries.filter((e) => e.status === params.status);
  }

  const limit = params.limit ?? 50;
  entries = entries.slice(-limit);

  const total = entries.length;
  const successCount = entries.filter((e) => e.status === "success").length;
  const errorCount = entries.filter((e) => e.status === "error").length;
  const avgDurationMs = total > 0 ? Math.round(entries.reduce((sum, e) => sum + e.duration_ms, 0) / total) : 0;

  return { total, successCount, errorCount, avgDurationMs, entries };
}

export function formatAuditReport(report: AuditReport, date: string): string {
  if (report.total === 0) {
    return `📋 ${date} 暂无审计日志`;
  }

  const lines = [
    `📋 ${date} 审计报告`,
    `总计: ${report.total} 次调用 | 成功: ${report.successCount} | 失败: ${report.errorCount} | 平均耗时: ${report.avgDurationMs}ms`,
    "",
  ];

  for (const entry of report.entries) {
    const time = entry.timestamp.slice(11, 19);
    const icon = entry.status === "success" ? "✅" : "❌";
    lines.push(`${time} ${icon} ${entry.tool} (${entry.duration_ms}ms)`);
    lines.push(`   入参: ${entry.input_preview}`);
    if (entry.error) {
      lines.push(`   错误: ${entry.error}`);
    }
  }

  return lines.join("\n");
}

export function withAudit(
  tool: AnyAgentTool,
  pluginId: string,
  options?: AuditOptions,
): AnyAgentTool {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    ...tool,
    execute: async (toolCallId, params, signal?, onUpdate?) => {
      const start = Date.now();
      let status: "success" | "error" = "success";
      let errorMsg: string | null = null;
      let result: AgentToolResult<unknown> | undefined;

      try {
        result = await tool.execute(toolCallId, params, signal, onUpdate);
      } catch (err) {
        status = "error";
        errorMsg = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const duration = Date.now() - start;
        const entry: AuditLogEntry = {
          timestamp: new Date().toISOString(),
          level: status === "error" ? "error" : "info",
          plugin_id: pluginId,
          tool: tool.name,
          duration_ms: duration,
          status,
          input_preview: sanitize(params, opts.maxInputLength),
          output_preview: result !== undefined ? sanitize(result, opts.maxOutputLength) : "",
          error: errorMsg,
        };

        if (opts.asyncFlush) {
          writeLog(entry, opts.logDir).catch(() => {});
        } else {
          await writeLog(entry, opts.logDir);
        }
      }

      return result;
    },
  };
}
