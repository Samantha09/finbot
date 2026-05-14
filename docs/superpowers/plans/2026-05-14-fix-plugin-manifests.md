# 修复扩展插件 manifest 与构建流程

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 finbot-audit、finbot-guard、finbot-rate-limit 创建缺失的 `openclaw.plugin.json` manifest 文件，修复 Docker 构建失败问题。

**Architecture:** 三个插件均使用 `definePluginEntry` 定义入口，缺少 OpenClaw 要求的 manifest。manifest 需声明插件 ID、名称、工具合约。创建后通过本地 `npm run build` 验证每个插件可编译。

**Tech Stack:** TypeScript / OpenClaw Plugin-SDK / Docker

---

### Task 1: finbot-audit manifest

**Files:**
- Create: `plugins/finbot-audit/openclaw.plugin.json`
- Test: `cd plugins/finbot-audit && npm run build`

该插件注册了一个 `auditReport` 查询工具，并通过 monkey-patch 为后续工具自动添加审计包装。

- [ ] **Step 1: 创建 manifest**

```json
{
  "id": "finbot-audit",
  "name": "FinBot Audit",
  "description": "FinBot 工具调用审计日志插件，记录每次 tool 执行的入参、出参、耗时和状态",
  "enabledByDefault": true,
  "activation": {
    "onStartup": true
  },
  "configSchema": {
    "type": "object",
    "properties": {}
  },
  "contracts": {
    "tools": [
      "auditReport"
    ]
  }
}
```

- [ ] **Step 2: 验证构建**

Run: `cd plugins/finbot-audit && npm run build`
Expected: 无错误，生成 `dist/` 目录

- [ ] **Step 3: 提交**

```bash
git add plugins/finbot-audit/openclaw.plugin.json
git commit -m "fix(audit): 补充缺失的 openclaw.plugin.json manifest"
```

---

### Task 2: finbot-guard manifest

**Files:**
- Create: `plugins/finbot-guard/openclaw.plugin.json`
- Test: `cd plugins/finbot-guard && npm run build`

该插件纯 runtime hook，不注册新工具，通过 `before_tool_call` 事件做风险评分，`registerAgentToolResultMiddleware` 做结果脱敏。

- [ ] **Step 1: 创建 manifest**

```json
{
  "id": "finbot-guard",
  "name": "FinBot Guard",
  "description": "FinBot 风险评分与结果脱敏插件，在工具调用前进行参数风险评分，在结果返回前对敏感信息进行脱敏",
  "enabledByDefault": true,
  "activation": {
    "onStartup": true
  },
  "configSchema": {
    "type": "object",
    "properties": {}
  },
  "contracts": {
    "tools": []
  }
}
```

- [ ] **Step 2: 验证构建**

Run: `cd plugins/finbot-guard && npm run build`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add plugins/finbot-guard/openclaw.plugin.json
git commit -m "fix(guard): 补充缺失的 openclaw.plugin.json manifest"
```

---

### Task 3: finbot-rate-limit manifest

**Files:**
- Create: `plugins/finbot-rate-limit/openclaw.plugin.json`
- Test: `cd plugins/finbot-rate-limit && npm run build`

该插件纯 tool wrapper + global fetch patch，不注册新工具。

- [ ] **Step 1: 创建 manifest**

```json
{
  "id": "finbot-rate-limit",
  "name": "FinBot Rate Limit",
  "description": "FinBot 限流熔断插件，为金融 API 提供统一限流、退避和熔断保护",
  "enabledByDefault": true,
  "activation": {
    "onStartup": true
  },
  "configSchema": {
    "type": "object",
    "properties": {}
  },
  "contracts": {
    "tools": []
  }
}
```

- [ ] **Step 2: 验证构建**

Run: `cd plugins/finbot-rate-limit && npm run build`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add plugins/finbot-rate-limit/openclaw.plugin.json
git commit -m "fix(rate-limit): 补充缺失的 openclaw.plugin.json manifest"
```

---

### Task 4: Dockerfile 构建验证（可选，本地 dry-run）

**Files:**
- Verify: `Dockerfile`

确认 Dockerfile 中的 COPY 指令现在有源文件可复制。

- [ ] **Step 1: 逐行检查 Dockerfile 中的 COPY 指令**

Run: `grep "openclaw.plugin.json" Dockerfile`
Expected: 每行对应的插件目录下现在都有该文件

---

## Self-Review

1. **Spec coverage:** 三个缺失的 manifest 文件各一个 Task，全部覆盖。
2. **Placeholder scan:** 无 TBD/TODO，manifest 内容完整。
3. **Type consistency:** 三个 manifest 均沿用 finbot-market 的 schema 结构，字段一致。
