#!/bin/sh
mkdir -p /root/.openclaw

# 首次启动：播种配置
if [ ! -f /root/.openclaw/openclaw.json ]; then
  cp /app/openclaw.json.template /root/.openclaw/openclaw.json

  # Docker 环境：禁用 bonjour（mDNS 在容器内不稳定）
  if [ -f /.dockerenv ]; then
    node -e "
      const fs = require('fs');
      const path = '/root/.openclaw/openclaw.json';
      const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
      cfg.plugins = cfg.plugins || {};
      cfg.plugins.entries = cfg.plugins.entries || {};
      cfg.plugins.entries.bonjour = { enabled: false };
      fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
    "
  fi
fi

# 首次启动：播种 workspace 文件（SOUL.md / IDENTITY.md / USER.md）
WS="/root/.openclaw/workspace"
if [ ! -d "$WS" ]; then
  mkdir -p "$WS"
  cp /app/workspace-template/* "$WS/"
fi

exec "$@"
