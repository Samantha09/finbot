# FinBot 后续需求文档 —— 全面路线图（Platform First）

**日期**: 2026-04-27  
**作者**: Claude Code (Kimi k2.6)  
**状态**: 待用户评审  

---

## 1. 项目现状

FinBot 是基于 OpenClaw 二次开发的个人金融投资 Agent，当前状态：

- **已存在工具**: market-query、portfolio-analysis、risk-assessment、news-fetch（mock）、set-alert
- **部署**: Docker，OpenClaw Gateway 运行
- **模型**: MiniMax M2.7
- **已知问题**: 虚构 API 待修（package.json、import 路径、config 字段）、mock 数据、零测试
- **插件**: finbot-market（5 工具），4 个候选插件待开发（audit / guard / rate-limit / confirm）

## 2. 总体目标

在 3 个月内完成 MVP，让用户能个人使用并小范围分享；架构预留 SaaS 化空间，支持多模型切换和按量计费。

## 3. 技术选型与约束

| 维度 | 决策 |
|------|------|
| 框架 | OpenClaw（不修改 core） |
| 扩展方式 | Plugin-SDK，runtime hooks |
| 语言 | TypeScript，strict 模式 |
| 数据持久化 | SQLite（零数据库依赖） |
| 部署 | Docker + Docker Compose |
| 前端 | React + Tailwind |
| 认证 | JWT |
| 模型路由 | 多 provider 可切换（MiniMax + OpenAI + Claude） |
| 计费 | 按量付费，MVP 只记录不收费 |

### 不变的安全红线
- `shellExec` / `fileWrite` / `fileDelete` 永久禁止
- 所有金融输出附 `⚠️ 不构成投资建议`
- API Key / Token 一律 `${ENV_VAR}` 注入，禁止硬编码
- 金融数据不暴露到项目目录

---

## 4. 分阶段路线图

### P0（第 1 月）：SaaS 底座 + 地基修复

#### 4.1.1 用户认证
- JWT token 认证，支持注册 / 登录 / 刷新
- 用户表存 SQLite：`user_id`, `email`, `password_hash`, `plan`, `created_at`
- MVP 不做 OAuth/社交登录
- 密码 bcrypt 哈希，不存明文

#### 4.1.2 多租户数据隔离
- 每用户独立命名空间：`finbot/{user_id}/portfolio`
- 工具调用时通过 `ctx` 注入 `userId`
- 持仓、提醒、偏好等按 `userId` 隔离存储
- 禁止跨命名空间读写

#### 4.1.3 用量追踪
- 每次工具调用记录：`user_id`, `tool_name`, `timestamp`, `model`, `tokens_used`
- 存 SQLite `usage_logs` 表
- 配额管理：免费层 X 次/天，超出标记待付费（MVP 不真扣费）

#### 4.1.4 按量计费脚手架
- 预留 Stripe Webhook 接口
- 定义计费模型：按 tool 调用次数 + token 消耗
- MVP 阶段只记录用量，后期接入支付

#### 4.1.5 地基修复（虚构 API）
按 `project_known_issues.md` 逐条修复：

| 文件 | 修复内容 |
|------|----------|
| `package.json` | `@openclaw/*` → `openclaw`（子路径导出） |
| `plugins/finbot-market/manifest.json` | 重命名为 `openclaw.plugin.json`，改 schema |
| `plugins/finbot-market/src/tools/*.ts` | import 路径改为 `openclaw/plugin-sdk` |
| `agents.yaml` | `harness` → `embeddedHarness`, `memoryNamespace` → `memorySearch`, `sandboxMode` → `sandbox` |
| `config.yaml` | 去掉虚构的 `cron.jobs` / `alerts` 字段 |
| `set-alert.ts` | 持久化路径修正为真实命名空间 |
| `README.md` | 安装命令和配置说明同步更新 |

#### 4.1.6 测试骨架
- 每个 tool 补单元测试（`*.test.ts`）
- `detectMarket()` 的边界 case 必须覆盖
- CI 跑 `tsc` + `test`

#### 4.1.7 Docker / CI
- Dockerfile 验证通过，`docker-compose up` 能跑
- GitHub Actions 骨架：lint → build → test

#### P0 交付标准
- [ ] `docker-compose up` 启动无报错
- [ ] 5 个现有工具都能正常调用
- [ ] 用户注册/登录可用
- [ ] 每个用户的数据互相隔离
- [ ] 用量追踪数据正确记录
- [ ] 所有测试通过

---

### P1（第 2 月）：核心工具 + 新数据源

#### 4.2.1 东方财富 / 同花顺 接入
- 优先东方财富（免费接口丰富，A 股数据全）
- A 股/港股实时行情走东方财富，美股走 Alpha Vantage，crypto 走 CoinGecko
- `detectMarket()` 增加路由逻辑，三处同步修改（`project_specific_decisions.md` 规则）

#### 4.2.2 技术分析工具 (`technical-analysis.ts`)
- **输入**: `symbol`, `timeRange`, `indicators[]`
- **支持指标**: MA(5/10/20/60), RSI(14), MACD, 布林带, KDJ
- **输出**: 指标数值 + 简单买卖信号解读
- **数据源**: 东方财富/Alpha Vantage 历史 K 线

#### 4.2.3 基本面分析工具 (`fundamental-analysis.ts`)
- **输入**: `symbol`
- **抓取字段**: PE, PB, ROE, 营收增长率, 净利润率, 负债率, 股息率
- **输出**: 估值水平判断 + 同行业对比
- **数据源**: 东方财富财务数据接口

#### 4.2.4 多模型切换
- `config.yaml` 声明多个 provider（MiniMax、OpenAI、Claude 等）
- Agent 支持按用户偏好切换模型
- 模型配置持久化到用户偏好

#### 4.2.5 审计插件 (finbot-audit)
- `afterToolExecution` hook 记录每次调用
- 日志字段：timestamp, user_id, tool_name, input摘要, output摘要
- 存 SQLite `audit_logs` 表
- 独立插件 manifest，不塞进 finbot-market

#### P1 交付标准
- [ ] A 股/港股实时行情能查
- [ ] 技术指标计算正确
- [ ] 基本面数据抓取正常
- [ ] 用户可切换模型
- [ ] 每次 tool 调用都有审计日志

---

### P2（第 3 月）：前端 + 通道 + 高级分析

#### 4.3.1 Web 前端
- **技术栈**: React + Tailwind
- **核心页面**:
  - 登录/注册页
  - 对话页（类 ChatGPT 界面，Markdown 渲染）
  - 持仓看板（表格 + 简单图表）
  - 提醒管理页
  - 用量统计页
- **图表**: K 线图 + 技术指标 overlay（ lightweight-charts 或 echarts ）
- **部署**: Docker 内 nginx 反代静态资源 + Gateway

#### 4.3.2 REST API
- OpenClaw Gateway 之外额外暴露 REST 端点
- **路由设计**:
  - `POST /api/v1/chat` — 发送消息，返回 Agent 回复
  - `GET /api/v1/portfolio` — 获取当前持仓
  - `GET /api/v1/alerts` — 获取提醒列表
  - `GET /api/v1/usage` — 获取用量统计
  - `GET /api/v1/quotes/:symbol` — 实时行情
- **认证**: `Authorization: Bearer <api_key>`
- **限流**: 按用户配额

#### 4.3.3 Email 通道
- OpenClaw Email channel 配置启用
- 用户发邮件提问，Agent 回复分析报告
- 定时报告：每日/每周投资摘要邮件（cron 触发）

#### 4.3.4 资产配置建议工具 (`asset-allocation.ts`)
- **输入**: 用户持仓 + 风险偏好 + 投资目标
- **输出**: 建议股债比例、行业分散度、地区配置
- **模型**: 简化版均值-方差模型（MVP 不追求精确优化）

#### 4.3.5 策略回测工具 (`strategy-backtest.ts`)
- **输入**: 策略规则（如 "RSI<30 买入，RSI>70 卖出"）+ 历史时间范围
- **输出**: 累计收益、最大回撤、夏普比率、交易明细表
- **数据**: 东方财富/Alpha Vantage 历史数据
- **可视化**: 收益曲线图

#### 4.3.6 新闻/情绪数据
- 接入新闻 API（NewsAPI 或聚合数据）
- 社交媒体情绪：微博/雪球/Reddit 舆情分析（如有免费接口）
- **输出**: 相关新闻摘要 + 情绪得分（看多/看空/中性）
- 替换 `news-fetch.ts` 的 mock 数据

#### P2 交付标准
- [ ] Web UI 能对话、看行情、管理持仓
- [ ] REST API 可用，有文档
- [ ] Email 通道正常收发
- [ ] 资产配置给出合理建议
- [ ] 策略回测结果可信
- [ ] 新闻/情绪数据真实

---

## 5. 扩展插件路线图（P1/P2 择机实现）

按 `project_extension_roadmap.md`，4 个候选插件：

| 插件 | 类型 | 时机 | 优先级 |
|------|------|------|--------|
| finbot-audit | runtime hook | P1 | 高 |
| finbot-rate-limit | tool wrapper | P2（接多数据源时） | 高 |
| finbot-guard | runtime hook | P2 | 中 |
| finbot-confirm | runtime hook | P2（有真实下单时再考虑） | 低 |

每个插件独立 manifest，不塞进 finbot-market。

---

## 6. 数据流与架构图

```
用户层
  ├── Web UI (React)
  ├── Telegram Bot
  ├── Email
  └── REST API (第三方集成)
         ↓
网关层: OpenClaw Gateway
  ├── WebSocket Server
  ├── Channel Adapters
  └── REST API Router
         ↓
Agent 层: FinBot Agent
  ├── 多模型路由 (MiniMax / OpenAI / Claude)
  ├── 用户认证中间件
  ├── 用量追踪中间件
  └── 审计 Hook
         ↓
工具层: Plugins
  ├── finbot-market
  │   ├── market-query (行情)
  │   ├── portfolio-analysis (持仓)
  │   ├── risk-assessment (风险评估)
  │   ├── news-fetch (新闻)
  │   ├── set-alert (提醒)
  │   ├── technical-analysis (技术分析) ← P1
  │   ├── fundamental-analysis (基本面) ← P1
  │   ├── asset-allocation (资产配置) ← P2
  │   └── strategy-backtest (回测) ← P2
  ├── finbot-audit (审计) ← P1
  ├── finbot-rate-limit (限流) ← P2
  └── finbot-guard (安全) ← P2
         ↓
数据源层
  ├── 东方财富 (A股/港股) ← P1
  ├── Alpha Vantage (美股)
  ├── CoinGecko (crypto)
  └── NewsAPI / 聚合数据 (新闻) ← P2
         ↓
基建层
  ├── SQLite (用户表 / usage_logs / audit_logs)
  ├── 数据隔离 (按 userId 命名空间)
  └── 计费记录 (预留 Stripe)
```

---

## 7. 风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| 东方财富接口不稳定或被封 | 中 | 高 |  fallback 到 Alpha Vantage，限速缓存 |
| 3 个月 SaaS 底座做不完 | 高 | 高 | 认证和隔离 MVP 化，支付真正后期接 |
| OpenClaw 升级 breaking change | 低 | 高 | 严格走 Plugin-SDK，不直接 import core |
| 模型调用成本高 | 中 | 中 | 按量计费转嫁给用户，免费层限次数 |
| 回测数据质量差 | 中 | 中 | 数据来源标注清楚，不承诺精度 |

---

## 8. 验收清单

### MVP 完成标准（3 个月后）

- [ ] 用户能注册/登录，数据互相隔离
- [ ] 5 个基础工具 + 技术分析 + 基本面分析可用
- [ ] A 股/港股/美股/crypto 都能查行情
- [ ] Web UI 能正常对话、看行情、管理持仓
- [ ] 用量追踪数据正确
- [ ] Docker 一键部署
- [ ] 所有测试通过

### 非 MVP 范围（3 月后不阻塞）

- 真实支付扣费（只记录）
- 策略回测的可视化图表
- 高级情绪分析（NLP 模型）
- 多语言支持
- 移动端 App

---

## 9. 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-04-27 | v0.1 | 初稿，基于 brainstorming 结果整理 |
