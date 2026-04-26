#!/bin/sh
mkdir -p /root/.openclaw
if [ ! -f /root/.openclaw/openclaw.json ]; then
  cp /app/openclaw.json.template /root/.openclaw/openclaw.json
fi
exec "$@"
