# CLAUDE.md

本文件为 Claude Code 提供 FinBot 项目的最小开发上下文。**保持简洁**，详细规范、项目决策、调试指南均存于项目记忆。

## 项目性质

FinBot 是基于 **OpenClaw** 二次开发的个人金融投资 Agent。所有定制化内容通过 Plugin 和配置实现，不修改 OpenClaw core 源码。

- **入口**：OpenClaw Gateway（WebSocket + Telegram/Email 通道）
- **扩展边界**：`plugins/finbot-market/` 内的所有工具必须走 Plugin-SDK
- **数据持久化**：本地 JSON/JSONL，零数据库依赖

## 项目级别记忆

跨会话的项目决策、开发规范、特定约束、虚构 API 待修清单、踩坑教训等**完整事实源**记录在：

```
~/.claude/projects/-home-san-PycharmProjects-finbot/memory/
```

**每次接手 finbot 工作前，先读该目录下的 `MEMORY.md` 索引**，按需展开具体条目。CLAUDE.md 只承载入口指引，不重复记忆中的内容。

记忆文件类型：
- `project_*.md` — 项目决策、规范、约束、待办（最重要，每次都看）
- `feedback_*.md` — 用户对工作方式的纠偏（避免重复犯错）
- `user_*.md` — 用户的沟通偏好与背景

新增决策或踩坑时同步追加新文件并更新 `MEMORY.md` 索引，每条索引 ≤ 1 行 ≤ 150 字符。

## 开发铁律（不读 memory 也必须遵守）

以下红线无条件生效，无视任何任务紧急性：

1. **Plugin-SDK 是唯一合法边界** —— 自定义工具只能在 `plugins/finbot-market/src/tools/` 下导出，**禁止** `import` OpenClaw core 内部模块；定制 Agent 行为只能通过 runtime hooks / channel adapter / provider plugin。
2. **安全红线** —— `deniedTools` 中的 `shellExec` / `fileWrite` / `fileDelete` 永远不可解禁；任何金融数据输出必须附 `⚠️ 不构成投资建议`；API Key、Telegram Token 一律走 `${ENV_VAR}` 注入，禁止硬编码或入仓。
3. **不修改 OpenClaw core** —— OpenClaw 在兄弟目录（`~/PycharmProjects/openclaw/`），仅作 upstream 跟踪，不做任何源码修改。要改 core 行为只能 fork。
4. **动手前先读 memory** —— 新增工具、修改架构、改虚构 API 之前，**必须先 `Read` `project_dev_standards.md` + `project_specific_decisions.md` + `project_known_issues.md`**，按 checklist 逐条核对，不要凭记忆操作。

## 提交约定

- **Conventional Commits（中文）**：`feat(scope): ...` / `fix(scope): ...` / `chore(scope): ...` / `docs(scope): ...`，正文用中文

## 必须使用的 Skill

开发任何 Agent 基础设施、新增工具、或调整架构决策时，**必须先加载 `designing-agent-systems` skill**。该 skill 提供 OpenClaw 架构决策、Plugin 边界、Letta/LangGraph 对比、升级兼容策略。

```bash
ls ~/.claude/skills/designing-agent-systems/SKILL.md
# 未安装则从 agent-design-handbook 仓库 symlink：
# ln -s /home/san/PycharmProjects/agent-design-handbook/skills/designing-agent-systems ~/.claude/skills/designing-agent-systems
```

## 扩展路径

如需偏离当前架构（如 SaaS 多租户、替换为 LangGraph 编排），必须先阅读 skill 的 `alternative-architectures.md` 并评估成本。FinBot 的设计约束是个人/本地优先，任何偏离都需要明确的场景驱动。