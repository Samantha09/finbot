// OpenClaw 插件开发的本地类型定义
// TODO: 接入 OpenClaw 真实 plugin-sdk 后替换为 openclaw/plugin-sdk 的导出
// 真实类型: OpenClawPluginToolContext, OpenClawPluginToolFactory, OpenClawAgentToolResult

export interface ToolContext {
  logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}
