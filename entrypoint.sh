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
  # 锁定 persona 文件为只读，防止对话中被篡改
  chmod 444 "$WS"/SOUL.md "$WS"/IDENTITY.md "$WS"/USER.md
fi

exec "$@"
