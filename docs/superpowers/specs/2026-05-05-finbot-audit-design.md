# finbot-audit 插件设计

**日期**: 2026-05-05
**范围**: `plugins/finbot-audit/`
**状态**: 已批准

---

## 目标

为 FinBot 所有工具调用提供合规审计日志，记录谁在什么时间调用了什么工具、传入什么参数、得到什么结果。独立插件，不修改 OpenClaw core 和 finbot-market 内部逻辑。

## 方案

### 核心机制：Tool Wrapper

OpenClaw Plugin-SDK 未公开 `afterToolExecution` hook（`hook-runtime.d.ts` 存在但无文档）。采用 **Tool Wrapper** 模式：

```ts
withAudit(tool: AnyAgentTool, options?: AuditOptions): AnyAgentTool
```

`finbot-market` 注册工具时包一层：`api.registerTool(withAudit(createMarketQueryTool()))`。

### 日志字段（对齐 OpenClaw PRISM 标准）

```json
{"timestamp":"2026-05-05T09:00:00.000Z","level":"info","plugin_id":"finbot-market","tool":"marketQuery","duration_ms":1247,"status":"success","input_preview":"symbol=600519.SH","output_preview":"价格: 1425.96 CNY | 涨跌: -0.35%","error":null}
```

| 字段 | 说明 |
|---|---|
| `timestamp` | ISO 8601 |
| `level` | info / warn / error |
| `plugin_id` | 插件标识 |
| `tool` | 工具名 |
| `duration_ms` | 执行耗时 |
| `status` | success / error |
| `input_preview` | 入参摘要（截断 200 字符，敏感值打码） |
| `output_preview` | 出参摘要（截断 500 字符） |
| `error` | 错误信息（如有） |

### Shadow Tool 检测

包装器对比 `tool.name` 与 `openclaw.plugin.json` 中 `contracts.tools` 列表。若调用的工具不在 manifest 中，日志 `level` 记为 `warn` 并附加 `"shadow_tool":true`。

### 存储

- 路径：`~/.openclaw/audit-logs/YYYY-MM-DD.jsonl`
- 按天轮转，append-only
- 零数据库依赖

### 配置选项

```ts
interface AuditOptions {
  logDir?: string;           // 默认 ~/.openclaw/audit-logs
  maxInputLength?: number;   // 默认 200
  maxOutputLength?: number;  // 默认 500
  asyncFlush?: boolean;      // 默认 false（同步写入，保可靠）
}
```

### 错误处理

审计写入失败（磁盘满、权限等）**不影响主流程**。`try/catch` 内吞异常，向 stderr 打印一行 `console.error("[finbot-audit] write failed:", err)`。

### 测试

- `withAudit` 包装后 execute 仍返回原结果
- 成功调用生成一条 JSONL
- 失败调用生成一条 `status:error` JSONL
- Shadow tool 触发 `level:warn`

---

## 参考

- [OpenClaw PRISM: A Zero-Fork, Defense-in-Depth Runtime Security Layer](https://arxiv.org/html/2603.11853v1)
- [OpenClaw Security Audit Guide 2026](https://www.sitepoint.com/openclaw-security-audit-detecting-malicious-ai-agent-plugins/)
