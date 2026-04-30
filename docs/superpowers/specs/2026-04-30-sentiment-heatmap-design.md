# 舆情分析 + 大盘热力图工具设计

## 背景

现有工具覆盖个股/ETF 微观分析和宏观指标，但缺少：
1. **舆情视角** —— 用户需要快速了解某只股票/主题的最新新闻和市场情绪
2. **板块视角** —— 用户需要一眼看清当日哪些行业领涨领跌、资金往哪流

## 方案

两个独立工具：

### 1. `sentimentAnalysis` —— 舆情分析

**输入参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `symbol` | string | 否 | 股票/ETF 代码，如 `510050`、`000858` |
| `keyword` | string | 否 | 主题关键词，如 `人工智能`、`黄金` |

约束：`symbol` 和 `keyword` 至少填一个。

**数据源：**
- East Money 新闻搜索 API：`https://searchapi.eastmoney.com/api/suggest/get` 获取新闻列表
- 或 `datacenter-web.eastmoney.com` 相关新闻接口

**输出格式：**
```
📰 贵州茅台(600519) 舆情概览

**最新动态**:
  1. [中性] 贵州茅台一季度营收同比增长15.2% ...
  2. [正面] 茅台批价回升至2850元 ...
  3. [负面] 某券商下调白酒行业评级 ...

**情绪判断**: 偏正面（正面2条 / 中性1条 / 负面1条）

⚠️ 不构成投资建议
```

**错误处理：**
- 新闻接口失败 → 该部分标"获取失败"
- 全部失败 → `isError: true`

### 2. `marketHeatmap` —— 大盘热力图

**输入参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `market` | string | 否 | 市场，默认 `A股`，可选 `港股` |

**数据源：**
- 行业涨跌幅：`https://push2.eastmoney.com/api/qt/clist/get?fs=m:90+t:2`（申万行业）
- 行业资金流向：`datacenter-web.eastmoney.com` 行业资金接口

**输出格式：**
```
📊 A股 行业热力图（2026-04-30）

**领涨行业**:
  1. 计算机 +3.45%  主力净流入 +45.2亿
  2. 电子 +2.89%   主力净流入 +38.7亿
  3. 通信 +2.12%   主力净流入 +22.1亿

**领跌行业**:
  1. 煤炭 -2.15%   主力净流出 -18.3亿
  2. 银行 -1.02%   主力净流出 -12.5亿

⚠️ 不构成投资建议
```

**错误处理：**
- 各接口独立 try/catch
- 失败部分标"数据暂缺"
- 全部失败 → `isError: true`

## 文件组织

```
src/tools/
  sentiment-analysis.ts          # 舆情分析工具
  sentiment-analysis.test.ts     # 测试
  market-heatmap.ts              # 大盘热力图工具
  market-heatmap.test.ts         # 测试
```

## 注册

在 `src/index.ts` 注册 `createSentimentAnalysisTool()` 和 `createMarketHeatmapTool()`，并在 `openclaw.plugin.json` 追加 `sentimentAnalysis`、`marketHeatmap`。

## 测试策略

| 类型 | 内容 |
|------|------|
| 单元测试 | 格式化函数、参数校验 |
| mock 测试 | mock 新闻/行业 API 返回，验证输出结构 |
| 真实 API 测试 | `it.skipIf(skipRealApi)` |

## 验证标准

- `npm run test:ci` 全部通过
- `npx tsc --noEmit` 无类型错误
- 输出末尾包含 `⚠️ 不构成投资建议`
