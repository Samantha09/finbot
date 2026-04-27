import type {
  AnyAgentTool,
  OpenClawPluginToolContext,
} from "openclaw/plugin-sdk/plugin-entry";
import { jsonResult } from "openclaw/plugin-sdk/core";

export type ToolContext = OpenClawPluginToolContext;
export type { AnyAgentTool };

export interface TextResult {
  content: string;
  isError?: boolean;
}

export function toToolResult(result: TextResult) {
  const text = result.isError ? `❌ ${result.content}` : result.content;
  return jsonResult({ text, isError: result.isError ?? false });
}
