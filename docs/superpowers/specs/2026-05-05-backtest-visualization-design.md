# 策略回测可视化设计

**日期**: 2026-05-05
**范围**: `plugins/finbot-market/src/tools/strategy-backtest.ts`
**状态**: 已批准

---

## 目标

让 `strategyBacktest` 工具在返回文本报告的同时，生成一份可交互的 HTML 可视化报告，包含收益曲线图、风险指标和交易明细。

## 方案

### 输出形式

生成本地 HTML 文件，路径为 `workspace/backtest-reports/<symbol>_<strategy>_<timestamp>.html`。

工具返回的 Markdown 文本末尾追加一行：

```
📄 可视化报告已生成: workspace/backtest-reports/600519_SH_MA_CROSSOVER_20260505_143000.html
```

### 图表内容

使用 lightweight-charts CDN（`unpkg.com`）绘制两条曲线：

1. **策略收益曲线**（蓝色）：`cash + shares * price`，即每次交易后的账户总市值
2. **持有收益曲线**（灰色）：`initialCapital * (close / firstClose)`，即买入持有到同期的基准收益

X 轴为日期，Y 轴为资金金额。支持缩放和 hover 查看具体数值。

### 页面布局

```
+----------------------------------+
|  FinBot 策略回测报告              |
|  600519.SH | MA_CROSSOVER         |
+----------------------------------+
|                                  |
|  [ 收益曲线图 (lightweight-charts) ] |
|                                  |
+----------------------------------+
|  总收益: +23.5%   最大回撤: -8.2% |
|  夏普比率: 1.34    胜率: 55%      |
+----------------------------------+
|  交易明细表格                     |
|  日期 | 操作 | 价格 | 股数 | 原因  |
+----------------------------------+
```

### 技术实现

1. **接口扩展**：`BacktestResult` 增加 `equityCurve: number[]`
2. **HTML 生成**：新增 `generateBacktestHtml(result, klines): string`，纯字符串模板拼接，不引入模板引擎
3. **文件写入**：`fs/promises.writeFile` 到 `workspace/backtest-reports/`
4. **零额外依赖**：lightweight-charts 走 CDN，不需要 `puppeteer`/`canvas`

### 数据流

```
execute(params)
  → fetchKlines(symbol, 500, klt)
  → runBacktest(klines, ...)          // 返回 BacktestResult（含 equityCurve）
  → generateBacktestHtml(result, klines)
  → fs.writeFile(workspace/backtest-reports/...)
  → toToolResult({ content: markdown + filePath })
```

### 错误处理

- HTML 生成失败不影响文本报告返回，降级为只输出 Markdown
- 目录不存在时自动 `mkdir -p`

### 测试

- `strategy-backtest.test.ts` 增加：
  - `generateBacktestHtml` 输出包含 `<html>`、`<script>`、`lightweight-charts` 字样
  - `equityCurve` 长度等于实际交易天数
