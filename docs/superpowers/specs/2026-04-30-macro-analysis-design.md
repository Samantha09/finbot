# 宏观经济数据查询工具设计

## 背景

现有工具覆盖个股/ETF 微观分析，但缺乏宏观经济视角。用户需要一键获取 CPI、PMI、利率、汇率等关键宏观指标，用于判断市场大环境和资产配置。

## 方案

**单一综合工具 `macroAnalysis`**，带 `category` 参数过滤：

| category | 说明 | 指标 |
|----------|------|------|
| `all`（默认） | 全部指标 | 通胀 + 货币 + 增长 + 对外 |
| `inflation` | 通胀类 | CPI、PPI |
| `monetary` | 货币类 | M2、社融、LPR |
| `growth` | 增长类 | GDP、PMI、失业率 |
| `external` | 对外类 | 美元兑人民币汇率 |

## Schema

```typescript
const MacroAnalysisSchema = {
  type: "object" as const,
  properties: {
    category: {
      type: "string" as const,
      enum: ["all", "inflation", "monetary", "growth", "external"],
      description: "指标分类，默认 all",
    },
  },
};
```

## 数据源

| 指标 | East Money API reportName |
|------|---------------------------|
| CPI | `RPT_ECONOMY_CPI` |
| PPI | `RPT_ECONOMY_PPI` |
| PMI | `RPT_ECONOMY_PMI` |
| GDP | `RPT_ECONOMY_GDP` |
| M2 | `RPT_ECONOMY_M2` |
| 社融 | `RPT_ECONOMY_FINANCING` |
| LPR | `RPT_ECONOMY_LPR` |
| 失业率 | `RPT_ECONOMY_UNEMPLOYMENT` |
| 汇率 | `push2.eastmoney.com` 外汇接口 |

## 输出格式

按分类分组，每个指标一行：名称 + 最新值 + 同比变化 + 环比变化。

示例：
```
通胀:
  CPI: 2.1%  (同比 -0.3pp  环比 +0.1pp)
  PPI: -1.2%  (同比 -0.5pp  环比 +0.2pp)
```

## 错误处理

- 各指标独立 `try/catch`
- 失败时该指标标"数据暂缺"
- 全部失败返回 `isError: true`

## 文件组织

```
src/tools/
  macro-analysis.ts          # 工具实现
  macro-analysis.test.ts     # 测试
```

## 注册

在 `src/index.ts` 注册 `createMacroAnalysisTool()`，并在 `openclaw.plugin.json` 追加 `macroAnalysis`。

## 测试策略

| 类型 | 内容 |
|------|------|
| 单元测试 | 格式化函数、同比环比计算 |
| mock 测试 | mock 各指标 API 返回，验证输出结构 |
| 真实 API 测试 | `it.skipIf(skipRealApi)` |

## 验证标准

- `npm run test:ci` 全部通过
- `npx tsc --noEmit` 无类型错误
- 输出末尾包含 `⚠️ 不构成投资建议`
