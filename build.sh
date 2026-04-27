#!/usr/bin/env bash
set -euo pipefail

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/PycharmProjects/openclaw}"
FINBOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Building openclaw image..."
docker build -t openclaw:latest "$OPENCLAW_DIR"

echo "==> Building finbot image..."
docker build -t finbot:latest "$FINBOT_DIR"

echo "==> Done. Run: docker compose up -d"
