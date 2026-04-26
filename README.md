# FinBot 金融投资助手

基于 OpenClaw 二次开发的个人金融投资 Agent，支持股票/基金/加密货币行情查询、投资组合分析、风险管理和定时提醒。

## 功能特性

- 📊 **实时行情**：查询 A股、港股、美股、加密货币行情
- 📈 **投资组合分析**：集中度、相关性、风险暴露分析
- ⚠️ **风险评估**：每笔投资建议前自动提示风险等级
- 🔔 **价格提醒**：止盈止损提醒，支持 Telegram/Email 推送
- 📰 **财经新闻**：获取关联新闻和财报信息
- ⏰ **定时简报**：每日开盘前市场概览、收盘后持仓分析

## 快速开始

### 前置条件

- Node.js >= 18
- [OpenClaw](https://github.com/openclaw/openclaw) 已安装（`npm install -g openclaw` 或从源码构建）
- Alpha Vantage API Key（股票行情）、CoinGecko（加密货币，无需 Key）

### 1. 克隆并安装

```bash
git clone https://github.com/Samantha09/finbot.git
cd finbot
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key 和 Token
```

### 3. 启动

```bash
openclaw start
```

### 4. Telegram 配对（可选）

1. 向 Bot 发送 `/start`
2. 在 Gateway 日志中获取 pairing code
3. 执行 `openclaw pairing approve telegram <code>`

## 项目结构

```
finbot/
├── agents.yaml                     # Agent 配置（人设、工具白名单、模型）
├── config.yaml                     # Gateway 配置（通道、Cron、插件）
├── .env                            # 环境变量（API Key、Token）
├── .env.example                    # 环境变量模板
├── LICENSE                         # MIT 许可证
└── plugins/
    └── finbot-market/              # 金融数据 Plugin
        ├── openclaw.plugin.json    # Plugin 声明
        ├── package.json
        └── src/
            └── tools/
                ├── market-query.ts
                ├── portfolio-analysis.ts
                ├── risk-assessment.ts
                ├── news-fetch.ts
                └── set-alert.ts
```

## 使用示例

```
用户: 查一下平安银行
FinBot: 📊 000001.SZ ...

用户: 分析我的持仓
FinBot: 📈 投资组合分析 ...

用户: 设置提醒 腾讯控股 低于 350
FinBot: ✅ 已设置价格提醒 ...
```

## 二次开发

基于 OpenClaw 的 Plugin-SDK 扩展，所有定制化内容在 `plugins/` 目录下：

- **新增数据源**：在 `plugins/finbot-market/src/tools/` 添加新工具
- **调整策略**：修改 `agents.yaml` 中的 persona 和 tools.allowed
- **新增通道**：参考 OpenClaw Channel Adapter 文档

**核心原则**：不修改 OpenClaw core 源码，所有扩展通过 Plugin 和配置实现。

## 许可证

MIT
