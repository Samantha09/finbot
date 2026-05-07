# gf_etf_search 广发 ETF 筛选工具设计

## 目标

为 FinBot 增加广发证券 ETF 多维度筛选能力，通过 `gfEtfSearch` 工具调用广发 API。

## 架构

- **工具**：`plugins/finbot-market/src/tools/gf-etf-search.ts` — 封装广发 `finance_api_inclusive_etf_list_get` API
- **Skill**：`skills/gf-etf-search/SKILL.md` — 教 LLM 何时使用、参数组合建议
- **注册**：在 `plugins/finbot-market/src/index.ts` 注册工具

## 组件

### 1. gfEtfSearch 工具

**输入参数**：所有 API 支持的筛选条件

| 参数 | 类型 | 说明 |
|------|------|------|
| search | string | 模糊搜索代码或名称 |
| type | string | ETF 类型：`股票ETF`、`境外ETF` 等 |
| trakType | string | 赛道：`宽基`、`行业`、`主题` 等 |
| oneTrakName | string | 一级赛道，如 `科技` |
| roc1m / roc6m / roc1y | string | 区间涨跌幅条件，如 `5~`、`0~20` |
| maxDrawdown1m / maxDrawdown1y | string | 最大回撤条件 |
| sharpRatio1y / sharpRatio3y | string | 夏普比率条件 |
| valuationResult | string | 估值区：`1`=低位，`2`=中位，`3`=高位 |
| indexTempType | string | 指数温度：`low`、`ord`、`high` |
| assetScale | string | 基金规模区间 |
| tradeT0 | string | 是否 T+0：`1`=是 |
| marginTrade | string | 是否两融：`1`=是 |
| sort | string | 排序字段，降序加 `-` 前缀 |
| limit | number | 结果数量限制 |

**API 调用**：
```
POST https://mcp-api.gf.com.cn/gf-skills/skills/mcp/call
Authorization: Bearer ${GF_SKILLS_APIKEY}
```

**输出**：格式化文本表格，含代码、名称、涨跌幅、估值、规模等关键字段。

### 2. Skill 文档

指导 LLM：
- 何时调用 gfEtfSearch（用户找 ETF、筛选、构建候选池）
- 常用参数组合示例
- 输出格式规范（表格 + 风险提示）

## 安全

- API Key 从 `${GF_SKILLS_APIKEY}` 环境变量读取
- 不将 key 写入代码或 git

## 测试

- vitest 单元测试：mock fetch，验证参数传递和格式化输出
