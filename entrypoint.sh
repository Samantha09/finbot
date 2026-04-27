#!/bin/sh
mkdir -p /root/.openclaw

# 首次启动：播种配置
if [ ! -f /root/.openclaw/openclaw.json ]; then
  cp /app/openclaw.json.template /root/.openclaw/openclaw.json
fi

exec "$@"
