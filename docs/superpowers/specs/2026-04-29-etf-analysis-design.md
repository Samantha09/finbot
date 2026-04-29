# ETF 综合分析工具设计

## 背景

现有 `market-query` 已能查询 ETF 实时行情（ETF 属 A 股，代码格式相同），但缺乏 ETF 特有维度的分析：规模费率、折溢价、持仓穿透、资金流向等。用户需要一个单一工具，输入 ETF 代码即可获取全景画像。

## 方案选择

选用 **方案 1：单一综合工具 `etfAnalysis`**，并加入用户要求的**资金流向**维度。

- 与现有 `fundamental-analysis` 模式一致，一次调用返回完整分析
- 四个子接口各自隔离失败，不互相影响

## 实现细节

### 1. Schema 定义

```typescript
const EtfAnalysisSchema = {
  type: "object" as const,
  properties: {
    symbol: {
      type: "string" as const,
      description: "ETF 代码，如 510050.SH、159915.SZ",
    },
  },
  required: ["symbol"],
};
```

### 2. 数据获取（四个并行接口）

| 维度 | 数据源 | 关键字段 |
|------|--------|---------|
| 行情 | `push2.eastmoney.com/api/qt/stock/get` | f43(价格), f170(涨跌幅), f47(成交量), f135(IOPV净值) |
| 基本信息 | `push2.eastmoney.com` 扩展字段 | 规模、管理费率、跟踪指数、成立日期 |
| 持仓 | `datacenter-web.eastmoney.com/api/data/v1/get` (`RPT_FUND_PORTFOLIO_STOCK`) | 前十大重仓股及占比 |
| 资金流向 | `datacenter-web.eastmoney.com/api/data/v1/get` (`RPT_ETF_MONEYFLOW`) | 当日/近5日/近10日主力净流入 |

### 3. 折溢价计算

```
折溢价率 = (市场价格 - IOPV净值) / IOPV净值 × 100%
```

### 4. 输出格式

```
📊 510050.SH 华夏上证50ETF

**基本信息**:
  基金规模: 1,200.5 亿
  管理费率: 0.50%
  跟踪指数: 上证50指数
  成立日期: 2004-12-30

**行情与折溢价**:
  最新价格: 2.650  (🔴 +1.23%)
  IOPV净值: 2.648
  折溢价率: +0.08%  (溢价)
  成交额: 15.2 亿

**近期收益**:
  近1月: +3.45%  近3月: +8.12%  近1年: +15.67%

**资金流向**:
  当日主力净流入: +2.3 亿
  近5日主力净流入: +8.7 亿
  近10日主力净流入: -1.2 亿

**前十大持仓**:
  | 股票 | 占比 |
  | 贵州茅台 | 15.23% |
  | 中国平安 | 8.45% |
  | ... |

⚠️ 不构成投资建议
```

### 5. 错误处理

- **代码格式校验**：仅支持 A 股格式（`\d{6}\.(SZ|SH|BJ)`），不匹配时返回 `isError: true`
- **子接口隔离**：四个接口各自 `try/catch`，失败时该维度标注"数据暂缺"，不阻断其他维度
- **全部失败**：返回 `toToolResult({ content, isError: true })`

### 6. 文件组织

```
src/tools/
  etf-analysis.ts          # 工具实现
  etf-analysis.test.ts     # 测试
```

### 7. 注册

在 `src/index.ts` 中注册 `createEtfAnalysisTool()`，并在 `openclaw.plugin.json` 的 `contracts.tools` 中追加 `etfAnalysis`。

### 8. 测试策略

| 测试类型 | 内容 |
|---------|------|
| 单元测试 | 折溢价计算、格式化函数 |
| 工具测试 | 元数据正确、错误路径、不支持代码格式 |
| mock 测试 | mock fetch 模拟四个接口返回，验证输出结构 |
| 真实 API 测试 | `it.skipIf(skipRealApi)`，验证真实 ETF（如 510050.SH）|

## 验证标准

- `npm run test:ci` 全部通过
- `npx tsc --noEmit` 无类型错误
- mock 测试覆盖所有四个接口的成功和失败场景
- 输出末尾包含 `⚠️ 不构成投资建议`
