# MiniMax 图片识别集成设计

## 背景

FinBot 的 OpenClaw Agent 缺少图片理解能力。通过集成 MiniMax CLI (`mmx-cli`) 的 `mmx vision` 命令，让本地和 Docker 容器内的 Agent 都能识别用户发送的图片（持仓截图、K 线图、财报截图等）。

## 方案

使用 **MiniMax CLI**（`mmx vision`），理由：
- 纯 Node.js 包，Docker 内只需 `npm install -g`
- 无后台进程，无进程管理开销
- 本地和容器行为完全一致
- 未来可扩展 `mmx search` 等能力

### 架构

```
用户发图片 → OpenClaw Agent → 调用 Bash
  → mmx vision describe --image <路径或URL>
  → MiniMax API → 返回图片描述
```

## 改动清单

### 1. Dockerfile

在构建阶段末尾添加全局安装：

```dockerfile
RUN npm install -g mmx-cli
```

### 2. docker-compose.yml

在 environment 段添加 API Key 注入：

```yaml
MINIMAX_API_KEY: ${MINIMAX_API_KEY}
```

### 3. 本地配置（手动一次性）

```bash
npm install -g mmx-cli
mmx auth login --api-key <sk-cp-xxx>
```

### 4. Agent 行为引导

在 memory 中记录：图片理解优先使用 `mmx vision describe --image <路径或URL>`。

### 5. SKILL（可选）

安装官方 SKILL 让 Agent 调用决策更准确：

```bash
npx skills add MiniMax-AI/cli -y -g
```

## 不涉及的改动

- 不修改任何 FinBot 插件代码
- 不引入 MCP server
- 不修改 OpenClaw core

## 安全

- API Key 通过 `.env` 注入，`.env` 已在 `.gitignore` 中
- Dockerfile 中不硬编码任何密钥

## 验证

- 本地：`mmx vision describe --image <URL>` 返回图片描述
- Docker：`docker compose exec openclaw mmx vision describe --image <URL>` 返回图片描述
