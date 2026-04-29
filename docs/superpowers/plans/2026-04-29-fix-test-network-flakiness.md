# 修复测试网络依赖不稳定性 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `technical-analysis` 和 `strategy-backtest` 的真实 API 测试添加环境变量条件跳过机制，使 CI 和弱网环境下测试稳定通过。

**Architecture:** 在测试文件顶部定义 `skipRealApi` 布尔值，通过 `it.skipIf(skipRealApi)` 包裹真实网络请求测试。纯计算测试不受影响。新增 `test:ci` npm 脚本统一跳过真实 API 测试。

**Tech Stack:** TypeScript 5.9 / vitest 3.2 / Node.js 20

---

### Task 1: 确认当前测试失败状态

**Files:**
- 无需修改文件

- [ ] **Step 1: 运行全部测试，记录失败用例**

Run:
```bash
cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run
```

Expected: 64 passed, 5 failed。失败用例为：
- `technical-analysis.test.ts` > `A 股查询成功（真实 API）`
- `technical-analysis.test.ts` > `港股查询成功（真实 API）`
- `technical-analysis.test.ts` > `港股 4 位代码补零到 5 位（真实 API）`
- `strategy-backtest.test.ts` > `A 股 MA 交叉回测成功`
- `strategy-backtest.test.ts` > `港股 RSI 回测成功`

---

### Task 2: 修改 technical-analysis.test.ts

**Files:**
- Modify: `plugins/finbot-market/src/tools/technical-analysis.test.ts`

- [ ] **Step 1: 在文件顶部添加跳过条件**

在现有 `import` 下方添加一行：

```typescript
const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";
```

- [ ] **Step 2: 包裹 3 个真实 API 测试**

将以下 3 个测试中的 `it(` 替换为 `it.skipIf(skipRealApi)(`：

1. `"A 股查询成功（真实 API）"`（原第 113 行）
2. `"港股查询成功（真实 API）"`（原第 125 行）
3. `"港股 4 位代码补零到 5 位（真实 API）"`（原第 135 行）

修改后的片段示例：

```typescript
  it.skipIf(skipRealApi)("A 股查询成功（真实 API）", async () => {
    const tool = createTechnicalAnalysisTool();
    const result = await tool.execute("tc2", { symbol: "600519.SH" });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("600519.SH");
    expect(parsed.text).toContain("MA");
    expect(parsed.text).toContain("RSI");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.isError).toBeFalsy();
  }, 15000);
```

其余测试（calcMA、calcRSI、calcMACD、calcBOLL、calcKDJ、tool 元数据、不支持格式报错）保持 `it(` 不变。

---

### Task 3: 修改 strategy-backtest.test.ts

**Files:**
- Modify: `plugins/finbot-market/src/tools/strategy-backtest.test.ts`

- [ ] **Step 1: 在文件顶部添加跳过条件**

在现有 `import` 下方添加一行：

```typescript
const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";
```

- [ ] **Step 2: 包裹 2 个真实 API 测试**

将以下 2 个测试中的 `it(` 替换为 `it.skipIf(skipRealApi)(`：

1. `"A 股 MA 交叉回测成功"`（原第 20 行）
2. `"港股 RSI 回测成功"`（原第 32 行）

修改后的片段示例：

```typescript
  it.skipIf(skipRealApi)("A 股 MA 交叉回测成功", async () => {
    const tool = createStrategyBacktestTool();
    const result = await tool.execute("tc2", { symbol: "600519.SH", strategy: "MA_CROSSOVER", shortPeriod: 5, longPeriod: 20 });
    const text = (result as any).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.text).toContain("600519.SH");
    expect(parsed.text).toContain("策略收益");
    expect(parsed.text).toContain("最大回撤");
    expect(parsed.text).toContain("不构成投资建议");
    expect(parsed.isError).toBeFalsy();
  }, 15000);
```

其余测试（tool 元数据、不支持格式报错）保持 `it(` 不变。

---

### Task 4: 修改 package.json 添加 test:ci 脚本

**Files:**
- Modify: `plugins/finbot-market/package.json`

- [ ] **Step 1: 在 scripts 中新增 test:ci**

在 `"scripts"` 对象内，在 `"test": "vitest run"` 下方添加：

```json
    "test:ci": "SKIP_REAL_API=1 vitest run"
```

修改后的 scripts 片段：

```json
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:ci": "SKIP_REAL_API=1 vitest run",
    "test:watch": "vitest",
    "watch": "tsc --watch",
    "lint": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  }
```

---

### Task 5: 验证修改

**Files:**
- 无需修改文件

- [ ] **Step 1: 运行 test:ci，确认 5 个真实 API 测试被跳过**

Run:
```bash
cd /home/san/PycharmProjects/finbot/plugins/finbot-market && SKIP_REAL_API=1 npx vitest run
```

Expected:
- Test Files: 9 passed (0 failed)
- Tests: 64 passed, 5 skipped (69 total)
- 无报错

- [ ] **Step 2: 运行默认 test，确认本地仍尝试真实 API**

Run:
```bash
cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx vitest run
```

Expected: 行为与修改前一致（本地网络正常时 69 全过，网络异常时 5 个真实 API 测试失败，其余 64 个通过）。

- [ ] **Step 3: TypeScript 类型检查**

Run:
```bash
cd /home/san/PycharmProjects/finbot/plugins/finbot-market && npx tsc --noEmit
```

Expected: 无输出（通过）。

---

### Task 6: 提交

**Files:**
- 已修改：
  - `plugins/finbot-market/src/tools/technical-analysis.test.ts`
  - `plugins/finbot-market/src/tools/strategy-backtest.test.ts`
  - `plugins/finbot-market/package.json`

- [ ] **Step 1: 暂存并提交**

```bash
git add plugins/finbot-market/src/tools/technical-analysis.test.ts
plugins/finbot-market/src/tools/strategy-backtest.test.ts
plugins/finbot-market/package.json
git commit -m "fix(tests): 为真实 API 测试添加环境变量条件跳过机制

- technical-analysis 和 strategy-backtest 的真实 API 测试在 CI/弱网环境下偶发失败
- 新增 SKIP_REAL_API / CI 环境变量控制跳过
- 新增 test:ci 脚本供 CI 使用
- 纯计算测试不受影响，始终运行"
```
