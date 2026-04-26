#!/bin/sh
mkdir -p /root/.openclaw

# 首次启动：播种配置
if [ ! -f /root/.openclaw/openclaw.json ]; then
  cp /app/openclaw.json.template /root/.openclaw/openclaw.json
fi

# 首次启动：播种 workspace 文件（SOUL.md / IDENTITY.md / USER.md）
WS="/root/.openclaw/workspace"
if [ ! -d "$WS" ]; then
  mkdir -p "$WS"
  cp /app/workspace-template/* "$WS/"
fi

exec "$@"
