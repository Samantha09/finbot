# 资产类型识别与分类分析实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持识别国债/债券/现金/REITs 等多种资产类型，固收资产不参与权益类风险分析，报告中展示资产配置结构。

**Architecture:** 在 Holding/AccountSummary 中增加 assetType 和 assetBreakdown 字段，riskAssessment 增加债券代码识别，portfolioAnalysis 默认只分析权益类，getPositionReport 按类型分类展示。

**Tech Stack:** TypeScript / OpenClaw Plugin-SDK / vitest

---

### Task 1: position-management 数据结构扩展

**Files:**
- Modify: `plugins/finbot-market/src/tools/position-management.ts`
- Test: `plugins/finbot-market/src/tools/position-management.test.ts`

- [ ] **Step 1: 扩展 Holding 和 AccountSummary 接口**

在 `Holding` 接口中增加 `assetType?: "equity" | "fund" | "bond" | "cash" | "reits";`
在 `AccountSummary` 接口中增加 `assetBreakdown?: Record<string, number>;`

- [ ] **Step 2: 扩展 UpdatePositionSchema**

`holdings[*].properties` 增加 `assetType: { type: "string", enum: ["equity", "fund", "bond", "cash", "reits"] }`
`summary.properties` 增加 `assetBreakdown: { type: "object", additionalProperties: { type: "number" } }`

- [ ] **Step 3: 更新报告格式函数**

`formatReport`：持仓明细表格增加"类型"列；新增"资产配置"板块，展示各类型市值及占比。
`formatHistoryReport`：成交明细和持仓变动中展示类型信息。

- [ ] **Step 4: 更新测试**

`sampleHolding` 增加 `assetType: "equity"`；添加包含 bond/cash 的测试用例；验证资产配置板块输出。

- [ ] **Step 5: 运行测试**

Run: `cd plugins/finbot-market && SKIP_REAL_API=1 npx vitest run src/tools/position-management.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add plugins/finbot-market/src/tools/position-management.ts plugins/finbot-market/src/tools/position-management.test.ts
git commit -m "feat(tools): position-management 支持资产类型与资产配置展示"
```

---

### Task 2: risk-assessment 债券代码识别

**Files:**
- Modify: `plugins/finbot-market/src/tools/risk-assessment.ts`
- Test: `plugins/finbot-market/src/tools/risk-assessment.test.ts`

- [ ] **Step 1: 修改 assessRisk 函数**

在 crypto/HK/A股/美股 判断之前，增加债券代码判断：
- symbol 匹配 `/^019\d{3}|^020\d{3}|^10\d{4}|^11\d{4}|^12\d{4}|^204\d{3}|^1318\d{2}/`
- 或 name 包含"国债"、"债券"、"逆回购"
- 债券直接返回 `{ level: "低", score: 2, factors: ["债券/固收类资产：波动较低，以获取票息收益为主"] }`

- [ ] **Step 2: 更新测试**

添加债券代码测试用例（如 "019741", "204001", "131810"），验证返回低风险。

- [ ] **Step 3: 运行测试**

Run: `SKIP_REAL_API=1 npx vitest run src/tools/risk-assessment.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add plugins/finbot-market/src/tools/risk-assessment.ts plugins/finbot-market/src/tools/risk-assessment.test.ts
git commit -m "feat(tools): risk-assessment 支持债券代码低风险识别"
```

---

### Task 3: portfolio-analysis 按资产类型过滤

**Files:**
- Modify: `plugins/finbot-market/src/tools/portfolio-analysis.ts`
- Test: `plugins/finbot-market/src/tools/portfolio-analysis.test.ts`

- [ ] **Step 1: 修改 Schema 和逻辑**

`holdings[*].properties` 增加 `assetType: { type: "string" }`（可选）。
执行逻辑：默认只取 `assetType` 为 `equity`/`fund`/`reits` 的持仓做集中度分析；其他类型（bond/cash/未指定）在"非权益类持仓"板块单独列出，不参与集中度风险计算和建议。

- [ ] **Step 2: 更新测试**

添加混合资产测试用例：包含 equity + bond + cash，验证 bond/cash 不参与集中度分析。

- [ ] **Step 3: 运行测试**

Run: `SKIP_REAL_API=1 npx vitest run src/tools/portfolio-analysis.test.ts`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add plugins/finbot-market/src/tools/portfolio-analysis.ts plugins/finbot-market/src/tools/portfolio-analysis.test.ts
git commit -m "feat(tools): portfolio-analysis 固收资产排除在集中度分析外"
```

---

### Task 4: Agent Prompt 与 Skill 更新

**Files:**
- Modify: `skills/position-management/SKILL.md`
- Modify: `openclaw.json`

- [ ] **Step 1: 更新 SKILL.md**

在"提取结构化数据"章节增加资产类型识别：
- 名称含"国债"、"债券"、"逆回购" → `assetType: "bond"`
- 名称含"货币"、"现金"、"余额宝"、"理财" → `assetType: "cash"`
- 名称含"REITs"、"基础设施" → `assetType: "reits"`
- 场外基金 → `assetType: "fund"`
- 其他股票/ETF → `assetType: "equity"`（默认）

在"调用工具"章节增加：`etfRotationStrategy` 的 `holdings` 只传入 `equity`/`fund`/`reits`，排除 `bond`/`cash`。

- [ ] **Step 2: 更新 openclaw.json**

第 10 条规则补充：`holdings` 参数须排除 `assetType` 为 `bond` 的持仓（包括国债逆回购）。
第 13 条规则补充：`updatePosition` 的 `holdings` 须根据截图内容正确标注 `assetType`。

- [ ] **Step 3: 验证 JSON 格式**

Run: `python3 -c "import json; json.load(open('openclaw.json')); print('JSON valid')"`
Expected: `JSON valid`

- [ ] **Step 4: 提交**

```bash
git add skills/position-management/SKILL.md openclaw.json
git commit -m "feat(config): Agent Prompt 支持资产类型识别与分类分析"
```

---

### Task 5: 全量测试验证

- [ ] **Step 1: 运行全部测试**

Run: `cd plugins/finbot-market && SKIP_REAL_API=1 npm test`
Expected: 全部 PASS

---

## Self-Review

1. **Spec coverage:** 四个文件类型全覆盖，Agent 行为同步更新。
2. **Placeholder scan:** 无 TBD/TODO。
3. **Type consistency:** assetType 枚举在 position-management、risk-assessment、portfolio-analysis、SKILL、openclaw.json 中一致。
