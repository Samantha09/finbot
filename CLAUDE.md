# CLAUDE.md

本文件为 Claude Code 提供 FinBot 项目的开发规范与上下文。

## 项目性质

FinBot 是基于 **OpenClaw** 二次开发的个人金融投资 Agent。所有定制化内容通过 Plugin 和配置实现，不修改 OpenClaw core 源码。

- **入口**：OpenClaw Gateway（WebSocket + Telegram/Email 通道）
- **Agent 配置**：`agents.yaml` 定义 persona、工具白名单、沙箱模式
- **扩展边界**：`plugins/finbot-market/` 内的所有工具必须走 Plugin-SDK
- **数据持久化**：本地 JSON/JSONL，零数据库依赖

## 必须使用的 Skill

开发任何 Agent 基础设施、新增工具、或调整架构决策时，**必须先加载 `designing-agent-systems` skill**。该 skill 提供：

- OpenClaw 架构决策的快速参考
- Plugin 开发的边界规范
- 与 Letta/LangGraph 的对比（用于偏离默认路径时的决策）
- 升级兼容性策略

**加载方式**：
```bash
# 确保 skill 已安装（agent-design-handbook 仓库中维护）
ls ~/.claude/skills/designing-agent-systems/SKILL.md
```

如果未安装，从 `agent-design-handbook` 仓库创建 symlink：
```bash
rm -rf ~/.claude/skills/designing-agent-systems
ln -s /home/san/PycharmProjects/agent-design-handbook/skills/designing-agent-systems \
  ~/.claude/skills/designing-agent-systems
```

## 开发规范

### 1. Plugin-SDK 边界（强制）

- 所有工具必须定义在 `plugins/finbot-market/src/tools/` 下
- 必须导出 `async function toolName(args, ctx: ToolContext): Promise<ToolResult>`
- 必须在 `manifest.json` 中声明工具名、参数 schema、权限列表
- **禁止**在工具中直接 `import` OpenClaw core 内部模块
- **禁止**在工具中执行未经沙箱隔离的系统命令

### 2. TypeScript 规范

- 严格模式：`tsconfig.json` 已启用 `strict: true`
- 所有工具参数定义 interface，不允许用 `any`
- 外部 API 返回类型用 `unknown` 或显式 interface，禁止隐式 `any`
- 错误处理：所有 `try/catch` 必须返回 `{ content: "...", isError: true }`，禁止抛未捕获异常

### 3. 工具开发 checklist

新增工具时必须完成：

1. [ ] 在 `src/tools/` 下创建 `.ts` 文件，实现函数并导出
2. [ ] 更新 `manifest.json` 的 `tools` 数组，添加参数 schema 和权限声明
3. [ ] 在 `agents.yaml` 的 `allowedTools` 中白名单化（如需要 Agent 调用）
4. [ ] 在 `README.md` 的功能列表和项目结构中补充说明
5. [ ] 处理网络超时和 API 限流，提供降级输出

### 4. 安全红线

- `deniedTools` 中永久禁止 `shellExec`、`fileWrite`、`fileDelete`
- 任何金融数据输出必须附加 `⚠️ 不构成投资建议`
- 不将用户 API Key 硬编码，一律通过 `.env` + `${ENV_VAR}` 注入
- 价格提醒等持久化数据存储在 `~/.openclaw/memory/finbot/` 下，不暴露到项目目录

### 5. 提交规范

采用 Conventional Commits，中文描述：

```
feat(tools): 新增基金净值查询工具
fix(market): 修复港股代码识别正则
chore(config): 调整定时任务执行时间
docs(readme): 更新使用示例
```

## 项目特定决策

### 市场识别规则

`market-query.ts` 中的 `detectMarket()` 是单一事实源：

- `-USD` / `-USDT` → crypto（CoinGecko）
- `.HK` → 港股（Alpha Vantage）
- `\d{6}.(SZ|SH|BJ)` → A股（Alpha Vantage）
- 其他 → 美股（Alpha Vantage）

新增市场类型时，**必须同步修改** `detectMarket()`、`risk-assessment.ts` 的风险因子、`README.md` 的支持列表。

### 记忆命名空间

- `memoryNamespace: "finbot/portfolio"` 专用于持仓数据、用户偏好
- 价格提醒存储在 `~/.openclaw/memory/finbot/portfolio/alerts.json`
- 禁止跨命名空间读写

### 定时任务约束

`config.yaml` 中的 `cron.jobs`：

- `sandboxMode: non-main` 表示在独立进程中执行，不影响主 Agent 循环
- 所有定时任务命令必须是 Agent 已声明的 `allowedTools` 子集
- 新增定时任务前，确认对应工具支持无交互式调用（无用户输入）

## 调试指南

### 本地启动 Gateway

```bash
# 1. 确保 .env 已配置
cp .env.example .env

# 2. 启动（前台模式，查看日志）
npx @openclaw/gateway start --config-dir ./

# 3. 测试工具（不经过 LLM，直接调用）
npx @openclaw/plugin-sdk test plugins/finbot-market/src/tools/market-query.ts
```

### 常见问题

- **Plugin 未加载**：检查 `config.yaml` 的 `plugins.scanDirs` 是否包含 `"./plugins"`，确认 `manifest.json` 的 `compatibility.minCoreVersion` 与 Gateway 版本匹配
- **工具调用失败**：查看 Gateway 日志中的 `tool_execution` 事件，确认 `args` 和 `ctx` 结构符合 Plugin-SDK 规范
- **Telegram 收不到消息**：确认 `allowlist.entries` 包含你的 Telegram ID，且 `allowWhenEmpty: false`

## 扩展路径

如需偏离当前架构（如增加 SaaS 多租户、替换为 LangGraph 编排），**必须先阅读 `designing-agent-systems` skill 的 `alternative-architectures.md` 并评估成本**。FinBot 当前的设计约束是个人/本地优先，任何偏离都需要明确的场景驱动。
