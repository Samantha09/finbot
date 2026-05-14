# 资产类型识别与分类分析设计文档

## 背景

用户持仓截图中可能包含国债、货币基金、现金理财等固定收益/现金类资产。当前系统将所有持仓统一视为权益类资产处理，导致：
- 国债被 `riskAssessment` 误判为美股，给出偏高风险评级
- `portfolioAnalysis` 对国债给出"分散至 5-8 只"的建议，不符合用户求稳意图
- `etfRotationStrategy` 可能建议将国债换为 ETF
- `getPositionReport` 无法展示权益/固收/现金的资产配置比例

## 目标

1. 支持识别和记录多种资产类型
2. 固收/现金类资产不参与权益类风险分析
3. 报告中展示资产配置结构
4. 轮动策略不将固收资产纳入调仓范围

## 资产类型定义

| 类型值 | 含义 | 典型标的 |
|--------|------|---------|
| `equity` | 权益类（默认） | 股票、ETF |
| `fund` | 基金 | 场外基金、LOF |
| `bond` | 债券/固收 | 国债、企业债、可转债、国债逆回购（204xxx/1318xx） |
| `cash` | 现金/货币基金 | 货币基金、余额宝、理财通、银行存款、可用资金 |
| `reits` | REITs | 基础设施 REITs |

## 数据结构变更

### Holding 接口扩展

```typescript
export interface Holding {
  symbol: string;
  name: string;
  quantity: number;
  availableQuantity?: number;
  costPrice?: number;
  currentPrice?: number;
  marketValue: number;
  profit?: number;
  profitPercent?: number;
  assetType?: "equity" | "fund" | "bond" | "cash" | "reits";
}
```

### AccountSummary 扩展

```typescript
export interface AccountSummary {
  totalAsset: number;
  dailyProfit?: number;
  availableCash?: number;
  holdingMarketValue?: number;
  holdingProfit?: number;
  positionRatio: number;
  assetBreakdown?: Record<string, number>; // 各类型市值，如 { equity: 80000, bond: 30000, cash: 10000 }
}
```

## 工具层变更

### updatePosition

- Schema 中 `holdings[*]` 增加 `assetType` 字段（可选，默认 `"equity"`）
- Schema 中 `summary` 增加 `assetBreakdown` 字段（可选）

### getPositionReport

- 单日报告中持仓明细表格增加"类型"列
- 新增"资产配置"板块，展示权益/固收/现金/其他的占比饼图文字版
- 历史报告中资产趋势表格增加各类型的市值列

### riskAssessment

- `assessRisk` 函数增加债券代码识别：
  - 沪市国债：`019XXX` / `020XXX`（上交所债券）
  - 深市债券：`10XXXX` / `11XXXX` / `12XXXX`
  - 含"国债"、"债券"字样的 symbol/name
- 债券类风险等级直接定为"低"，评分 2-3 分

### portfolioAnalysis

- 参数增加可选的 `assetTypes` 过滤（如只分析 `equity`+`fund`）
- 默认行为：只分析权益类（`equity`+`fund`+`reits`），固收和现金单独列出但不参与集中度风险计算
- 报告输出增加"非权益类持仓"板块

## Agent 层变更

### SKILL.md

- 提取数据时：识别"国债"、"债券"、"货币"、"现金"、"余额宝"、"理财"等关键词，标记对应 `assetType`
- 成交确认时：如果用户买卖的是债券，记录 `assetType: "bond"`
- `etfRotationStrategy` 调用时：只传入 `assetType` 为 `equity`/`fund`/`reits` 的持仓，排除 `bond`/`cash`

### openclaw.json

- 第 10 条规则补充：`etfRotationStrategy` 的 `holdings` 参数须排除债券和现金类资产
- 第 13 条规则补充：`updatePosition` 的 `holdings` 须根据截图内容正确标注 `assetType`

## 测试覆盖

- `position-management.test.ts`：验证 `assetType` 可正确存储和展示
- `risk-assessment.test.ts`：验证债券代码返回低风险评级
- `portfolio-analysis.test.ts`：验证固收资产被排除在集中度分析外

## 自审

1. **Placeholder scan**：无 TBD/TODO。
2. **内部一致性**：资产类型枚举在数据结构、工具 schema、Agent prompt 中一致。
3. **范围**：本 spec 只覆盖资产类型识别与分类展示，不涉及债券估值/利率分析等深度功能。
4. **歧义**：`assetBreakdown` 为可选字段，兼容旧数据；未提供时报告不展示资产配置板块。
