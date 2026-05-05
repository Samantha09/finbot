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
