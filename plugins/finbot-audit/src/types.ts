import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

export type { AnyAgentTool };

export interface AuditOptions {
  logDir?: string;
  maxInputLength?: number;
  maxOutputLength?: number;
  asyncFlush?: boolean;
}

export interface AuditLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  plugin_id: string;
  tool: string;
  duration_ms: number;
  status: "success" | "error";
  input_preview: string;
  output_preview: string;
  error: string | null;
  shadow_tool?: boolean;
}
