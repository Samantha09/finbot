export interface AnyAgentTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
}

export interface OpenClawPluginToolContext {
  // Stub — tests don't need real context
}

export function definePluginEntry(entry: {
  id: string;
  name: string;
  description: string;
  register: (api: { registerTool: (tool: AnyAgentTool) => void }) => void;
}) {
  return entry;
}
