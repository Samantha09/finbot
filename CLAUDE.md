# FinBot — TypeScript / OpenClaw Plugin SDK / Docker

## 关于本文件

`CLAUDE.md` 为 Claude Code 提供项目级指导。

## 项目性质

FinBot 是基于 **OpenClaw** 二次开发的个人金融投资 Agent。所有定制化内容通过 Plugin 和配置实现，不修改 OpenClaw core 源码。

- **入口**：OpenClaw Gateway（WebSocket + Telegram/Email 通道）
- **扩展边界**：`plugins/finbot-market/` 内的所有工具必须走 Plugin-SDK
- **数据持久化**：本地 JSON/JSONL，零数据库依赖

## 开发工作流（Superpowers Skills）

本项目全流程使用 Superpowers skills 套件，所有开发任务必须遵循以下工作流：

| 场景 | Skill |
|------|-------|
| 任何创造性工作（新功能、新组件、修改行为） | `/superpowers:brainstorming` |
| 多步骤实现任务（有规格或需求文档） | `/superpowers:writing-plans` |
| 执行已有实现计划 | `/superpowers:executing-plans` |
| 功能开发或 Bug 修复 | `/superpowers:test-driven-development` |
| 遇到 Bug、测试失败、异常行为 | `/superpowers:systematic-debugging` |
| 即将声称工作完成/通过 | `/superpowers:verification-before-completion` |
| 完成实现，需要集成 | `/superpowers:finishing-a-development-branch` |
| 完成任务后请求审查 | `/superpowers:requesting-code-review` |
| 收到代码审查反馈 | `/superpowers:receiving-code-review` |
| 2+ 个独立任务可并行 | `/superpowers:dispatching-parallel-agents` |

关键规则：
- **开发前必须先阅读编码规范**（memory: `typescript-coding-standards.md`）
- **编码前必须先 brainstorming**
- **TDD 优先**：先写测试，再写实现
- **证据优先于断言**：声称完成前必须有验证命令的输出作为证据
- **收到审查反馈时保持严谨**：不盲目同意，技术上验证每条反馈

## 提交约定

遵循 Conventional Commits：

```
<类型>(<范围>): <描述>
```

**类型**：`feat` / `fix` / `hotfix` / `perf` / `build` / `ci` / `chore` / `docs` / `refactor` / `revert` / `style` / `test`

**范围（括号内容）**：使用英文或中文标识模块，如 `tools`、`market`、`config`、`readme`

**描述**：至少 5 个字符，使用中文

示例：

```
feat(tools): 新增基金净值查询工具
fix(market): 修复港股代码识别正则
chore(config): 调整定时任务执行时间
docs(readme): 更新使用示例
```

**分支名规范**：`master` | `dev` | `feature` | `master_xxx` | `dev_xxx` | `feature_xxx` | `maintenance_xxx` | `bugfix`，只能使用英文字母、数字和下划线

注意：commit message 中**不要**添加 `Co-Authored-By` 行。

## 项目特定规范

### 技术栈

TypeScript 5.9+ / Node.js 20+ / vitest 3.2+ / CommonJS / `strict: true`。

### 核心约束

1. **Plugin-SDK 是唯一合法边界** —— 禁止 `import` OpenClaw core 内部模块。
2. **错误处理** —— 工具 `execute` 的 `try/catch` 必须返回 `toToolResult({ content, isError: true })`。
3. **安全红线** —— `shellExec/fileWrite/fileDelete` 永禁；金融数据附 `⚠️ 不构成投资建议`；API Key 走 `${ENV_VAR}`；隐私数据不入 git。

详细编码规范（类型、命名、异步、测试）见 `typescript-coding-standards.md`；代码审查清单（BLOCKER / WARNING / checklist）见 `code-review-standards.md`。市场识别与数据源路由见 `project_specific_decisions.md`。

## 必须使用的 Skill

开发任何 Agent 基础设施、新增工具、或调整架构决策时，**必须先加载 `designing-agent-systems` skill**。该 skill 提供 OpenClaw 架构决策、Plugin 边界、Letta/LangGraph 对比、升级兼容策略。

```bash
ls ~/.claude/skills/designing-agent-systems/SKILL.md
# 未安装则从 agent-design-handbook 仓库 symlink：
# ln -s /home/san/PycharmProjects/agent-design-handbook/skills/designing-agent-systems ~/.claude/skills/designing-agent-systems
```

## 构建与部署

**统一用 docker compose，不要裸机构建：**

```bash
# 构建并启动（包含 openclaw 基础镜像 + finbot 插件）
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

Dockerfile 是两阶段构建：从 `openclaw:latest` 镜像复制类型编译插件，最终镜像基于 openclaw runtime。**不要在宿主机上跑 pnpm install / npm link / symlink**，所有构建在容器内完成。

## 扩展路径

如需偏离当前架构（如 SaaS 多租户、替换为 LangGraph 编排），必须先阅读 skill 的 `alternative-architectures.md` 并评估成本。FinBot 的设计约束是个人/本地优先，任何偏离都需要明确的场景驱动。

## 参考文档

详细规范已迁移至 memory，开发前按需阅读：

| 主题 | Memory 文件 |
|------|------------|
| **TypeScript 编码规范（必读）** | `typescript-coding-standards.md` — 类型系统 / 命名 / 错误处理 / 异步 / 测试 |
| **代码审查规范（必读）** | `code-review-standards.md` — BLOCKER / WARNING 清单 / 工具开发 checklist |
| **项目特定决策** | `project_specific_decisions.md` — 市场识别 / 记忆命名空间 / 定时任务约束 / 数据源路由 |
| **OpenClaw 集成方式** | `project_openclaw_integration.md` — 兄弟目录而非仓库内，core 不进 finbot 仓库 |
| **虚构 API 待修清单** | `project_known_issues.md` — package.json / tools 引用了不存在的 @openclaw/* 包 |
| **扩展插件路线图** | `project_extension_roadmap.md` — audit / guard / rate-limit / confirm 四个候选方向 |
| **发布路径决策** | `project_release_path.md` — 选定 Docker + npm 双轨，先做 Docker |
| **回答风格偏好** | `user_communication_style.md` — 简洁、口语、对比表 + 决策清单 |
