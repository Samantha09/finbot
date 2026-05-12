# FinBot 仓位管理功能设计文档

## 目标

每天收盘后，用户通过聊天发送券商 APP 的持仓截图和成交截图，Agent 提取结构化数据并存储，自动生成调仓记录和持仓对比报告。

## 架构

```
用户发持仓截图 + 成交截图
        ↓
OpenClaw Agent（受 position-management skill 指导）
        ↓
├─ 识别截图内容，提取结构化数据
├─ 调用 updatePosition 工具存储
└─ 调用 getPositionReport 工具生成报告
        ↓
本地 JSON 文件（plugins/finbot-market/data/positions/）
```

## 新增组件

| 组件 | 路径 | 说明 |
|------|------|------|
| OpenClaw Skill | `skills/position-management/SKILL.md` | 触发条件、解析工作流、确认交互 |
| 插件工具 | `plugins/finbot-market/src/tools/position-management.ts` | `updatePosition` + `getPositionReport` |
| 测试 | `plugins/finbot-market/src/tools/position-management.test.ts` | vitest 单元测试 |
| 数据目录 | `plugins/finbot-market/data/positions/` | 本地 JSON/JSONL 存储 |

## 数据模型

### 每日记录（DailyRecord）

```ts
interface DailyRecord {
  date: string;                    // "2026-05-12"
  summary: AccountSummary;
  holdings: Holding[];
  trades: Trade[];
}

interface AccountSummary {
  totalAsset: number;              // 总资产
  dailyProfit: number;             // 当日盈亏
  availableCash: number;           // 可用资金
  holdingMarketValue: number;      // 持仓市值
  holdingProfit: number;           // 持仓盈亏
  positionRatio: number;           // 仓位比例 (0~1)
}

interface Holding {
  symbol: string;                  // 代码，如 "510310"
  name: string;                    // 名称，如 "沪深300ETF易方达"
  quantity: number;                // 持仓数量
  availableQuantity: number;       // 可用数量
  costPrice: number;               // 成本价
  currentPrice: number;            // 现价
  marketValue: number;             // 市值
  profit: number;                  // 持仓盈亏金额
  profitPercent: number;           // 持仓盈亏百分比 (小数)
}

interface Trade {
  time: string;                    // 成交时间，如 "09:33:05"
  symbol: string;                  // 代码
  name: string;                    // 名称
  direction: "buy" | "sell";       // 方向
  price: number;                   // 成交价
  quantity: number;                // 成交数量
  amount: number;                  // 成交额
}
```

### 文件存储格式

- **单日本地文件**：`data/positions/2026-05-12.json`
- **追加日志**：`data/positions/positions.jsonl`（每行一条 JSON，便于后续分析）
- **最新持仓缓存**：`data/positions/latest.json`（方便快速查询）

## Skill 触发规则

### 生效条件（满足任一）

1. 用户消息包含"持仓"、"仓位"、"成交"、"今日操作"等关键词，且附带图片
2. 用户明确说"更新持仓"、"汇报今日持仓"、"记录今天的仓位"

### 解析工作流

1. **识别图片类型**：持仓截图 vs 成交截图
   - 持仓截图特征：包含"总资产"、"持仓市值"、"仓位"等关键词
   - 成交截图特征：包含"成交时间"、"买入"、"卖出"等关键词
2. **提取结构化数据**：从表格中读取每行记录
3. **数据校验**：
   - `quantity * currentPrice ≈ marketValue`
   - `price * quantity ≈ amount`（成交记录）
   - 校验失败时标注异常，要求用户确认
4. **向用户确认**：展示提取的关键字段（代码、数量、金额），用户说"确认"后存储
5. **存储**：调用 `updatePosition`
6. **生成报告**：若历史记录存在，调用 `getPositionReport`

## 插件工具设计

### `updatePosition`

**Schema：**
```json
{
  "type": "object",
  "properties": {
    "date": { "type": "string", "description": "日期，如 2026-05-12" },
    "holdings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "symbol": { "type": "string" },
          "name": { "type": "string" },
          "quantity": { "type": "number" },
          "availableQuantity": { "type": "number" },
          "costPrice": { "type": "number" },
          "currentPrice": { "type": "number" },
          "marketValue": { "type": "number" },
          "profit": { "type": "number" },
          "profitPercent": { "type": "number" }
        },
        "required": ["symbol", "name", "quantity", "marketValue"]
      }
    },
    "trades": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "time": { "type": "string" },
          "symbol": { "type": "string" },
          "name": { "type": "string" },
          "direction": { "type": "string", "enum": ["buy", "sell"] },
          "price": { "type": "number" },
          "quantity": { "type": "number" },
          "amount": { "type": "number" }
        },
        "required": ["symbol", "direction", "price", "quantity"]
      }
    },
    "summary": {
      "type": "object",
      "properties": {
        "totalAsset": { "type": "number" },
        "dailyProfit": { "type": "number" },
        "availableCash": { "type": "number" },
        "holdingMarketValue": { "type": "number" },
        "holdingProfit": { "type": "number" },
        "positionRatio": { "type": "number" }
      },
      "required": ["totalAsset", "positionRatio"]
    }
  },
  "required": ["date", "holdings", "summary"]
}
```

**行为：**
1. 创建 `data/positions/` 目录（不存在时）
2. 写入 `data/positions/{date}.json`
3. 追加到 `data/positions/positions.jsonl`
4. 更新 `data/positions/latest.json`
5. 若同日期已存在，覆盖并标注"已更新"

**返回：** 存储成功确认 + 数据摘要

### `getPositionReport`

**Schema：**
```json
{
  "type": "object",
  "properties": {
    "date": { "type": "string", "description": "日期，默认最新记录" }
  }
}
```

**行为：**
1. 读取指定日期记录
2. 查找前一日记录（按日期倒序，跳过无记录日期）
3. 计算差异：
   - 总资产变化 = 今日.totalAsset - 昨日.totalAsset
   - 持仓市值变化 = 今日.holdingMarketValue - 昨日.holdingMarketValue
   - 盈亏变化 = 今日.holdingProfit - 昨日.holdingProfit
   - 仓位变化 = 今日.positionRatio - 昨日.positionRatio
   - 调仓明细：逐只对比 quantity，结合 trades 验证
4. 生成 Markdown 报告

**报告格式：**
```markdown
## 持仓日报（2026-05-12）

### 账户概览
| 指标 | 今日 | 昨日 | 变化 |
|------|------|------|------|
| 总资产 | 124,607.15 | 124,875.95 | -268.80 |
| 持仓市值 | 118,883.80 | ... | ... |
| 仓位 | 95.41% | ... | ... |

### 持仓明细
| 代码 | 名称 | 数量 | 市值 | 盈亏 | 占比 |
|------|------|------|------|------|------|
| 510310 | 沪深300ETF易方达 | 600 | 2,882.40 | -19.00 | 2.42% |

### 今日调仓
| 时间 | 代码 | 方向 | 价格 | 数量 | 金额 |
|------|------|------|------|------|------|
| 09:33:05 | 510310 | 买入 | 4.819 | 400 | 1,927.60 |

### 持仓变化
- 沪深300ETF易方达：+600 股（今日买入 600 股）
- 中概互联网ETF：-4,500 股（今日卖出 4,500 股）

⚠️ 不构成投资建议
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 截图解析失败 | 返回错误，请求用户以文字/表格形式补充 |
| 数据校验失败（如数量×价格≠金额） | 标注异常字段，要求用户确认 |
| 重复提交同一日期 | 覆盖旧数据，返回"已更新"提示 |
| 前一日记录缺失 | 仅存储当日数据，报告跳过对比部分 |
| 文件系统异常 | 返回 `toToolResult({ isError: true })` |

## 测试策略

- **正常路径**：mock fs，验证存储和报告生成
- **重复覆盖**：同一日期两次提交，验证覆盖行为
- **前日缺失**：仅当日数据，验证报告跳过对比
- **数据校验**：异常数据（quantity * price ≠ amount）验证标注逻辑
- **调仓检测**：模拟两日持仓变化，验证调仓明细生成

## 提交计划

按以下顺序提交：
1. `feat(tools): 新增 positionManagement 仓位管理工具`
2. `feat(skill): 新增 position-management Skill 指导 Agent 解析持仓截图`
3. `feat(config): 注册 positionManagement 工具到 openclaw.plugin.json`
