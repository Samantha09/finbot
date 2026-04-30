# FinBot 金融投资助手

基于 OpenClaw 二次开发的个人金融投资 Agent，支持 A股/港股/美股/加密货币 行情查询、舆情分析、宏观数据、投资组合分析与风险管理。

## 功能特性

- **实时行情**：A股、港股、美股、加密货币行情查询
- **ETF 分析**：规模、费率、折溢价、资金流向、前十大持仓
- **舆情分析**：A股/港股/美股/加密货币 新闻情绪判断
- **大盘热力图**：A股/港股 行业涨跌幅与主力资金流向
- **宏观经济**：中国（CPI/PPI/PMI/GDP/M2/社融/LPR/失业率/汇率）+ 美国（CPI/美联储利率/失业率/GDP）
- **投资组合分析**：集中度、相关性、风险暴露分析
- **风险评估**：每笔投资建议前自动提示风险等级
- **价格提醒**：止盈止损提醒，支持 Telegram/Email 推送
- **财经新闻**：获取关联新闻和财报信息
- **内置 Skill**：Agent 自动识别场景并调用对应工具

## 快速开始

### 方式一：Docker（推荐）

适合大多数用户，一键启动，包含 OpenClaw + FinBot 完整环境。

```bash
git clone https://github.com/Samantha09/finbot.git
cd finbot
cp .env.example .env
# 编辑 .env，填入 MINIMAX_API_KEY、ALPHA_VANTAGE_API_KEY 等
docker compose up -d --build
```

访问 `http://localhost:18789` 或配置 Telegram/Email 通道与 Agent 交互。

### 方式二：已有 OpenClaw，只装插件

如果你已经运行了 OpenClaw，只想增加金融分析能力：

```bash
# 1. 安装插件
npm install -g finbot-market

# 2. 找到全局安装路径
npm root -g
# 输出示例：/usr/local/lib/node_modules

# 3. 修改你的 openclaw.json
{
  "plugins": {
    "load": {
      "paths": ["/usr/local/lib/node_modules/finbot-market"]
    },
    "entries": {
      "finbot-market": { "enabled": true }
    }
  }
}

# 4. 复制内置 Skill（可选，推荐）
mkdir -p ~/.openclaw/workspace/skills
cp -r $(npm root -g)/finbot-market/skills/finbot-market ~/.openclaw/workspace/skills/
```

### 方式三：源码运行

适合二次开发：

```bash
git clone https://github.com/Samantha09/finbot.git
cd finbot
npm install
cd plugins/finbot-market && npm install && npm run build && cd ../..
openclaw start
```

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 | 必填 |
|------|------|------|
| `MINIMAX_API_KEY` | MiniMax LLM API Key | 是 |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage（美股行情、新闻、宏观） | 是 |
| `COINGECKO_API_KEY` | CoinGecko（加密货币，免费版留空） | 否 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | 否 |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway 访问令牌 | 否（默认 finbot-local-token） |

## 项目结构

```
finbot/
├── openclaw.json              # Agent 配置（模型、系统提示词、插件列表）
├── config.yaml                # Gateway 配置（通道、Cron）
├── Dockerfile / docker-compose.yml
├── skills/finbot-market/      # 内置 Skill（Agent 工作流指导）
├── plugins/
│   └── finbot-market/         # 金融数据插件
│       ├── src/tools/         # 13+ 分析工具
│       └── openclaw.plugin.json
└── docs/superpowers/          # 设计文档与实现计划
```

## 工具清单

| 工具 | 说明 | 市场 |
|------|------|------|
| `marketQuery` | 实时行情查询 | A股/港股/美股/加密货币 |
| `etfAnalysis` | ETF 综合分析 | A股 |
| `fundamentalAnalysis` | 基本面分析 | A股 |
| `technicalAnalysis` | 技术指标分析 | A股 |
| `sentimentAnalysis` | 舆情情绪分析 | A股/港股/美股/加密货币 |
| `marketHeatmap` | 行业热力图 | A股/港股 |
| `macroAnalysis` | 宏观经济数据 | 中国/美国 |
| `portfolioAnalysis` | 投资组合分析 | 通用 |
| `riskAssessment` | 风险评估 | 通用 |
| `setAlert` / `checkAlerts` | 价格提醒 | 通用 |
| `newsFetch` | 财经新闻获取 | A股/港股/美股 |
| `strategyBacktest` | 策略回测 | A股 |

## Telegram 配对（可选）

1. 向 Bot 发送 `/start`
2. 在 Gateway 日志中获取 pairing code
3. 执行 `openclaw pairing approve telegram <code>`

## 二次开发

基于 OpenClaw 的 Plugin-SDK 扩展，所有定制化内容在 `plugins/` 目录下：

- **新增数据源**：在 `plugins/finbot-market/src/tools/` 添加新工具，返回 `AnyAgentTool` 对象，并在 `src/index.ts` 中 `api.registerTool()` 注册
- **调整策略**：修改 `AGENTS.md` 中的人设和规则
- **新增通道**：参考 OpenClaw Channel Adapter 文档

**核心原则**：不修改 OpenClaw core 源码，所有扩展通过 Plugin 和配置实现。

## 许可证

MIT
