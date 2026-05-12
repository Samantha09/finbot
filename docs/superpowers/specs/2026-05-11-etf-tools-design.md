# FinBot ETF 工具扩展设计文档

## 背景

用户主要进行 ETF 交易，现有工具在 ETF 选择方面已有覆盖（筛选、榜单、量化选基策略），但**择时**存在明显空白。`technicalAnalysis` 是通用技术分析，未针对 ETF 给出明确的买卖信号和综合评级。

本设计新增三个工具，形成 ETF 交易闭环：
- **B. ETF 轮动策略**（选什么）
- **A. ETF 技术择时**（什么时候买卖）
- **C. 智能定投**（买多少）

## 目标

1. 新增 `etfRotationStrategy` 工具：多因子量化评分，输出"当前应重点配置哪只 ETF"。
2. 新增 `etfTimingSignal` 工具：基于均线/MACD/RSI/布林带/KDJ/量价的综合择时信号。
3. 新增 `etfSmartInvest` 工具：基于估值温度的智能定投倍数建议。

## 架构

三个工具均归入 `finbot-market` 插件，不新建插件（它们是市场数据工具，非基础设施）。

```
finbot-market/src/tools/
  etf-rotation-strategy.ts       # B. ETF 轮动策略
  etf-rotation-strategy.test.ts
  etf-timing-signal.ts           # A. ETF 技术择时
  etf-timing-signal.test.ts
  etf-smart-invest.ts            # C. 智能定投
  etf-smart-invest.test.ts
```

### 数据复用

| 工具 | 主要数据源 | 复用模块 |
|------|-----------|---------|
| `etfRotationStrategy` | 广发 `etf_search` 接口 | `gf-etf-search.ts` 的 `fetchGfEtfList` |
| `etfTimingSignal` | 东财 K 线接口 | `technical-analysis.ts` 的 `fetchKlines`、`calcMA`、`calcRSI`、`calcMACD`、`calcBOLL`、`calcKDJ` |
| `etfSmartInvest` | 广发 `etf_search` 接口 | `gf-etf-search.ts` 的 `fetchGfEtfList` |

### 注册

在 `finbot-market/src/index.ts` 中新增：

```ts
import { createEtfRotationStrategyTool } from "./tools/etf-rotation-strategy.js";
import { createEtfTimingSignalTool } from "./tools/etf-timing-signal.js";
import { createEtfSmartInvestTool } from "./tools/etf-smart-invest.js";

api.registerTool(createEtfRotationStrategyTool());
api.registerTool(createEtfTimingSignalTool());
api.registerTool(createEtfSmartInvestTool());
```

同时在 `openclaw.json` 的 `systemPromptOverride` 中补充 Agent 使用规则：
- 当用户询问 ETF 轮动/配置/当前该买什么时，使用 `etfRotationStrategy`
- 当用户询问某只 ETF 的买卖时机/技术信号时，使用 `etfTimingSignal`
- 当用户询问 ETF 定投金额/估值温度时，使用 `etfSmartInvest`

---

## B. ETF 轮动策略 (`etfRotationStrategy`)

### 功能
输入一组 ETF 代码，对每只进行多因子量化评分，按总分排序，给出轮动建议。

### 参数
```ts
{
  symbols: string[]           // ETF 代码列表，如 ["510050.SH", "159915.SZ"]
  period: "short" | "medium" | "long"  // 轮动周期
  maxResults?: number         // 返回前 N 只，默认全部
}
```

### 多因子评分模型

根据 `period` 动态调整权重：

| 因子 | short | medium | long | 计算方式 |
|------|-------|--------|------|---------|
| 动量（收益率） | 40% | 35% | 25% | roc1m*0.5 + roc3m*0.3 + roc6m*0.2 |
| 资金（主力流向） | 30% | 25% | 20% | netMainForce5d / netMainForce10d |
| 估值（PE/PB 百分位） | 15% | 25% | 35% | 百分位越低分数越高，<5% 不再额外加分 |
| 质量（规模+夏普） | 15% | 15% | 20% | 规模>1亿加分，夏普>1加分 |

**动量因子（short 示例）：**
```
score_momentum = roc1m*0.5 + roc3m*0.3 + roc6m*0.2
```
归一化到 0~100 分。

**资金因子：** 直接取 `netMainForce5d` 和 `netMainForce10d`，正值加分，负值减分，归一化到 0~100。

**估值因子：** `pePercent` / `pbPercent` 越低分数越高。公式：`score = 100 - pePercent`，即 0% 对应 100 分，100% 对应 0 分。设置下限保护：pePercent < 5 时按 5 计算，避免价值陷阱无限加分。

**质量因子：**
- assetScale > 1e9：+10
- sharpRatio1y > 1：+10
- sharpRatio3y > 1：+5

### 建议规则
- 评分 >= 75：增持
- 评分 60~74：持有
- 评分 45~59：减持
- 评分 < 45：观望

### 输出格式
```markdown
## ETF 轮动策略评分（中期）

| 排名 | 代码 | 名称 | 综合评分 | 动量 | 资金 | 估值 | 质量 | 建议 |
|------|------|------|----------|------|------|------|------|------|
| 1 | 510050 | 上证50ETF | 82 | 85 | 78 | 80 | 75 | 增持 |

### 详细分析
1. **510050** — 动量最强（近1月 +5.2%），资金持续流入...
```

### 错误处理
- 无效代码自动过滤，有效代码继续评分。
- 单只 ETF 数据缺失时该因子记 50 分（中性）。
- 全部代码无效或接口异常 → `toToolResult({ isError: true })`。

### 测试要点
- mock `fetchGfEtfList`，返回 3 只 ETF 的完整数据。
- 验证 `short` / `medium` / `long` 三种权重下同一只 ETF 得分不同。
- 验证部分数据缺失时的降级逻辑（缺失因子记 50 分）。
- 验证无效代码过滤。

---

## A. ETF 技术择时 (`etfTimingSignal`)

### 功能
输入单只 ETF 代码，自动计算均线/MACD/RSI/布林带/KDJ/量价，输出综合评级和评分明细。

### 参数
```ts
{
  symbol: string              // ETF 代码，如 510050.SH
  period?: "daily" | "weekly" // 默认 daily
}
```

### 多指标评分模型

复用 `technical-analysis.ts` 的 `fetchKlines`、`calcMA`、`calcRSI`、`calcMACD`、`calcBOLL`、`calcKDJ`。

| 指标 | 满分 | 信号规则 |
|------|------|----------|
| 均线排列 | +/-30 | MA5>MA10>MA20>MA60 → 多头排列 +30；MA5<MA10<MA20<MA60 → 空头排列 -30；其他 0 |
| MACD | +/-25 | 金叉（DIF 上穿 DEA）+25；死叉 -25；DIF>DEA&柱线为正 +15；DIF<DEA&柱线为负 -15 |
| RSI(14) | +/-15 | <30 超卖 +15；30~45 +5；45~55 0；55~70 +5；>70 超买 -10 |
| 布林带 | +/-10 | 跌破下轨 +10；突破上轨 -10；轨道内 0 |
| KDJ | +/-10 | K<20&D<20 超卖 +10；K>80&D>80 超买 -10；金叉 +5；死叉 -5 |
| 量价配合 | +/-10 | 上涨+放量（>前5日均量20%）+10；上涨+正常 +5；下跌+放量 -10；下跌+正常 -5 |

**综合评级：**
- >= 60：买入
- 30~59：观望偏强
- -10~29：观望偏弱
- < -10：卖出

### 金叉/死叉检测

现有 `calcMACD` 只返回最新值，需扩展为计算最近 N 天的序列：

```ts
function calcMACDSeries(closes: number[]): Array<{ dif: number; dea: number; macd: number }> {
  // 从第 26 根开始，逐日计算 DIF/DEA/MACD
}
```

金叉判断：`difSeries[i-1] <= deaSeries[i-1] && difSeries[i] > deaSeries[i]`

KDJ 金叉/死叉同理，需保留逐日 K/D 值序列。

### 量价配合
取最近 6 根 K 线，比较今日成交量 vs 前 5 日均量，结合涨跌幅判断。

### 输出格式
```markdown
## 510050.SH 择时信号（日线）

**综合评级：买入（68分）**

| 指标 | 信号 | 评分 | 说明 |
|------|------|------|------|
| 均线排列 | 多头排列 | +30 | MA5(2.48)>MA10(2.45)>MA20(2.42)>MA60(2.38) |
| MACD | 金叉 | +25 | DIF(0.12) 上穿 DEA(0.08)，柱线由负转正 |
| RSI(14) | 中性偏强 | +5 | 当前 58.3 |
| 布林带 | 轨道内 | 0 | 价格 2.45 处于中轨 2.44 附近 |
| KDJ | 中性 | 0 | K=45, D=42 |
| 量价 | 放量上涨 | +8 | 涨+1.2%，成交量较前5日均量+23% |

**操作建议：** 均线多头排列 + MACD 金叉形成共振，技术指标整体偏多，可考虑分批建仓。
```

### 错误处理
- K 线不足 60 根 → 降级为只计算可用指标，评分按满分比例折算。
- 单指标计算失败 → 该指标记 0 分，不影响其他指标。
- 接口完全失败 → `toToolResult({ isError: true })`。

### 测试要点
- mock K 线构造典型场景：多头排列+金叉、空头排列+死叉、震荡市（全部中性）。
- 验证金叉/死叉检测逻辑（构造 DIF/DEA 连续 3 天数据）。
- 验证 K 线不足时的降级逻辑。

---

## C. 智能定投 (`etfSmartInvest`)

### 功能
输入 ETF 代码和基础定投金额，根据当前估值温度自动调整定投倍数。

### 参数
```ts
{
  symbol: string        // ETF 代码
  baseAmount?: number   // 基础定投金额（元），默认 1000
}
```

### 估值数据来源
复用 `gfEtfSearch` 的底层接口，按 `tradeCode` 查询单只 ETF，取：
- `pePercent` — PE 百分位
- `pbPercent` — PB 百分位
- `indexTempType` — 广发指数温度（low/ord/high）

### 定投倍数模型

以 **PE 和 PB 百分位的平均值** 作为"综合估值百分位"：

| 综合估值百分位 | 估值状态 | 定投倍数 | 投入金额（base=1000） |
|----------------|----------|----------|----------------------|
| <= 10% | 极度低估 | 3.0x | 3000 元 |
| 10% ~ 20% | 低估 | 2.0x | 2000 元 |
| 20% ~ 30% | 偏低 | 1.5x | 1500 元 |
| 30% ~ 50% | 正常 | 1.0x | 1000 元 |
| 50% ~ 70% | 偏高 | 0.5x | 500 元 |
| 70% ~ 90% | 高估 | 0.25x | 250 元 |
| > 90% | 极度高估 | 0x | 暂停定投 |

### 降级策略
- 仅 `pePercent` 可用 → 用 PE 百分位单独计算。
- 仅 `pbPercent` 可用 → 用 PB 百分位单独计算。
- 仅 `indexTempType` 可用 → low→1.5x、ord→1.0x、high→0x 粗略映射。
- 全部缺失 → `toToolResult({ isError: true })`。

### 数据冲突处理
若 `indexTempType` 与 PE/PB 百分位冲突（如温度 low 但 PE 百分位 60%），优先采信 PE/PB 数值（更客观），输出中标注"数据不一致，请留意"。

### 输出格式
```markdown
## 510050.SH 智能定投建议

**当前估值状态：低估**

| 指标 | 数值 | 说明 |
|------|------|------|
| PE 百分位 | 15.3% | 历史较低水平 |
| PB 百分位 | 22.1% | 历史偏低水平 |
| 综合估值百分位 | 18.7% | 低估区间 |
| 指数温度 | low | 广发: 低温 |

**定投建议：**
- 基础金额：1000 元
- 建议倍数：2.0x
- 本次建议投入：2000 元

**策略逻辑：** 综合估值百分位 18.7%，处于低估区间，建议加倍定投以积累更多低成本份额。
```

### 测试要点
- mock 广发接口，验证各区间边界值（10%、20%、30%、50%、70%、90%）的倍数映射。
- 验证仅 `pePercent` 可用时的降级逻辑。
- 验证仅 `indexTempType` 可用时的粗略映射。
- 验证全部缺失时的错误返回。

---

## 错误处理统一约定

三个工具遵循 `finbot-market` 现有错误处理模式：
1. `try/catch` 包裹 `execute` 主逻辑。
2. 失败时返回 `toToolResult({ content: "错误信息", isError: true })`。
3. 部分数据缺失时降级处理，不直接失败。
4. 所有输出末尾附加 `⚠️ 不构成投资建议`。

## 测试策略

每个工具独立测试文件，遵循现有 vitest 模式：
1. mock 底层接口（广发 `etf_search`、东财 `push2his`）。
2. 覆盖正常路径、边界条件、降级路径、错误路径。
3. 评分算法用固定输入验证固定输出（确定性测试）。

## 提交计划

按 B → A → C 的顺序逐个实现和提交，每个工具一个 commit：

```
feat(tools): 新增 etfRotationStrategy ETF 轮动策略工具
feat(tools): 新增 etfTimingSignal ETF 技术择时信号工具
feat(tools): 新增 etfSmartInvest ETF 智能定投工具
```
