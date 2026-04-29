# 修复测试网络依赖导致的不稳定性

## 问题

`technical-analysis` 和 `strategy-backtest` 工具的部分测试直接调用东方财富 `push2his.eastmoney.com` K 线接口。该接口在当前网络环境偶发不可达，导致 CI 和本地测试出现非代码类失败（`fetch failed`）。

## 方案选择

选用 **方案 B：保留真实 API 测试，添加环境条件跳过**。

- 本地开发时仍可验证真实接口连通性
- CI / 弱网环境通过环境变量自动跳过不稳定测试
- 纯计算函数测试不受影响，始终运行

## 实现细节

### 1. 跳过条件

在测试文件顶部定义：

```typescript
const skipRealApi = process.env.SKIP_REAL_API === "1" || process.env.CI === "true";
```

### 2. 测试包裹

对涉及真实网络请求的测试用例使用 `it.skipIf(skipRealApi)`：

| 文件 | 用例名 | 处理方式 |
|------|--------|---------|
| `technical-analysis.test.ts` | A 股查询成功（真实 API） | `it.skipIf(skipRealApi)` |
| `technical-analysis.test.ts` | 港股查询成功（真实 API） | `it.skipIf(skipRealApi)` |
| `technical-analysis.test.ts` | 港股 4 位代码补零到 5 位（真实 API） | `it.skipIf(skipRealApi)` |
| `strategy-backtest.test.ts` | A 股 MA 交叉回测成功 | `it.skipIf(skipRealApi)` |
| `strategy-backtest.test.ts` | 港股 RSI 回测成功 | `it.skipIf(skipRealApi)` |

纯计算测试（`calcMA`、`calcRSI` 等）以及元数据、错误路径测试保持 `it()` 不变。

### 3. 脚本更新

在 `plugins/finbot-market/package.json` 新增：

```json
"test:ci": "SKIP_REAL_API=1 vitest run"
```

默认 `test` 脚本行为不变，本地仍跑全部测试。

## 验证标准

- `npm test` 在本地网络正常时全部通过（含真实 API 测试）
- `npm run test:ci` 或 `SKIP_REAL_API=1 npm test` 在相同环境下 64 个稳定测试全部通过，5 个真实 API 测试被跳过
- TypeScript 类型检查无新增错误
