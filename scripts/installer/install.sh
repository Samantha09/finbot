#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Detect non-interactive mode
NON_INTERACTIVE=false
if [ ! -t 0 ]; then
  NON_INTERACTIVE=true
fi

echo "========================================"
echo "  FinBot Installer for OpenClaw"
echo "========================================"
echo ""

# 1. Detect OpenClaw installation
OPENCLAW_ROOT=""
if command -v openclaw &> /dev/null; then
  OPENCLAW_ROOT=$(npm root -g)/openclaw
fi

if [ -z "$OPENCLAW_ROOT" ] || [ ! -d "$OPENCLAW_ROOT" ]; then
  echo -e "${RED}Error: OpenClaw not found. Please install OpenClaw first:${NC}"
  echo "  npm install -g openclaw"
  exit 1
fi

echo -e "${GREEN}OpenClaw found at:${NC} $OPENCLAW_ROOT"

# 2. Detect extensions directory
EXTENSIONS_DIR=""
if [ -d "$OPENCLAW_ROOT/dist/extensions" ]; then
  EXTENSIONS_DIR="$OPENCLAW_ROOT/dist/extensions"
elif [ -d "$OPENCLAW_ROOT/extensions" ]; then
  EXTENSIONS_DIR="$OPENCLAW_ROOT/extensions"
else
  EXTENSIONS_DIR="$OPENCLAW_ROOT/dist/extensions"
  mkdir -p "$EXTENSIONS_DIR"
fi

echo -e "${GREEN}Extensions directory:${NC} $EXTENSIONS_DIR"

# 3. Install plugins
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "Installing FinBot plugins..."
for plugin in market audit guard rate-limit; do
  PLUGIN_NAME="finbot-$plugin"
  PLUGIN_SRC="$SCRIPT_DIR/plugins/$PLUGIN_NAME"
  PLUGIN_DST="$EXTENSIONS_DIR/$PLUGIN_NAME"

  if [ -d "$PLUGIN_DST" ]; then
    echo -e "  ${YELLOW}Updating${NC} $PLUGIN_NAME"
    rm -rf "$PLUGIN_DST"
  else
    echo -e "  ${GREEN}Installing${NC} $PLUGIN_NAME"
  fi
  cp -r "$PLUGIN_SRC" "$PLUGIN_DST"
done

# 4. Install skills
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
SKILLS_DIR="$OPENCLAW_HOME/workspace/skills"
mkdir -p "$SKILLS_DIR"

echo ""
echo "Installing FinBot skills..."
for skill in "$SCRIPT_DIR/skills"/*; do
  if [ -d "$skill" ]; then
    SKILL_NAME=$(basename "$skill")
    if [ -d "$SKILLS_DIR/$SKILL_NAME" ]; then
      echo -e "  ${YELLOW}Updating${NC} $SKILL_NAME"
      rm -rf "$SKILLS_DIR/$SKILL_NAME"
    else
      echo -e "  ${GREEN}Installing${NC} $SKILL_NAME"
    fi
    cp -r "$skill" "$SKILLS_DIR/"
  fi
done

# 5. Merge config (preserves existing API keys, models, etc.)
echo ""
echo "Merging FinBot configuration into existing openclaw.json..."
node "$SCRIPT_DIR/merge-config.js"

# 6. Configure environment variables
ENV_FILE="$OPENCLAW_HOME/finbot.env"
echo ""
echo "========================================"
echo "  Environment Configuration"
echo "========================================"
echo ""

# Check if already configured
if [ -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}Existing config found:${NC} $ENV_FILE"
  echo "Current values:"
  grep -E "^GF_SKILLS_APIKEY" "$ENV_FILE" 2>/dev/null || echo "  (none set)"
  echo ""
  if [ "$NON_INTERACTIVE" = true ]; then
    echo "Non-interactive mode: updating config from bundled defaults."
    CONFIGURE_ENV=true
  else
    read -p "Update configuration? [y/N] " UPDATE_ENV
    if [[ ! "$UPDATE_ENV" =~ ^[Yy]$ ]]; then
      echo "Skipped. Using existing config."
    else
      CONFIGURE_ENV=true
    fi
  fi
else
  CONFIGURE_ENV=true
fi

# Load defaults from bundled template if present
BUNDLED_ENV="$SCRIPT_DIR/finbot.env"
if [ -f "$BUNDLED_ENV" ]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    val="${val//\"/}"
    export "$key=$val" 2>/dev/null || true
  done < "$BUNDLED_ENV"
fi

if [ "$CONFIGURE_ENV" = true ]; then
  if [ "$NON_INTERACTIVE" = true ]; then
    echo "Non-interactive mode: using bundled finbot.env defaults."
  else
    echo ""
    echo -e "${BLUE}Please enter your API keys (press Enter to keep current/default):${NC}"
    echo ""

    # GF_SKILLS_APIKEY
    GF_CURRENT="${GF_SKILLS_APIKEY:-}"
    if [ -n "$GF_CURRENT" ]; then
      GF_PROMPT="GF_SKILLS_APIKEY [default: ${GF_CURRENT:0:4}****]: "
    else
      GF_PROMPT="GF_SKILLS_APIKEY: "
    fi
    read -p "$GF_PROMPT" GF_INPUT
    if [ -n "$GF_INPUT" ]; then
      GF_SKILLS_APIKEY="$GF_INPUT"
    fi
  fi

  # Write env file
  cat > "$ENV_FILE" << EOF
# FinBot Environment Configuration
# Source this file in your shell: source ~/.openclaw/finbot.env

# GF Skills API Key (ETF/股票数据: ETF排行、基金详情、估值对比等 8 个工具共用)
GF_SKILLS_APIKEY=${GF_SKILLS_APIKEY:-}

# Optional
export TZ=Asia/Shanghai
EOF

  chmod 600 "$ENV_FILE"
  echo ""
  echo -e "${GREEN}Config saved to:${NC} $ENV_FILE"
fi

# 7. Offer to add to shell profile
echo ""
SHELL_PROFILE=""
if [ -f "$HOME/.bashrc" ]; then
  SHELL_PROFILE="$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [ -f "$HOME/.profile" ]; then
  SHELL_PROFILE="$HOME/.profile"
fi

if [ -n "$SHELL_PROFILE" ]; then
  SOURCE_LINE="source \"$ENV_FILE\"  # FinBot environment"
  if grep -q "finbot.env" "$SHELL_PROFILE" 2>/dev/null; then
    echo -e "${GREEN}finbot.env already sourced in${NC} $SHELL_PROFILE"
  elif [ "$NON_INTERACTIVE" = true ]; then
    echo "Non-interactive mode: skipping shell profile modification."
    echo -e "${YELLOW}To auto-load on login, add this to your shell profile:${NC}"
    echo "  $SOURCE_LINE"
  else
    read -p "Add 'source finbot.env' to $SHELL_PROFILE? [Y/n] " ADD_TO_PROFILE
    if [[ ! "$ADD_TO_PROFILE" =~ ^[Nn]$ ]]; then
      echo "" >> "$SHELL_PROFILE"
      echo "$SOURCE_LINE" >> "$SHELL_PROFILE"
      echo -e "${GREEN}Added to${NC} $SHELL_PROFILE"
      echo -e "${YELLOW}Run 'source $SHELL_PROFILE' to apply in current session.${NC}"
    else
      echo ""
      echo -e "${YELLOW}Manual setup required. Add this line to your shell profile:${NC}"
      echo "  $SOURCE_LINE"
    fi
  fi
else
  echo ""
  echo -e "${YELLOW}No shell profile found. Add this to your shell startup:${NC}"
  echo "  source \"$ENV_FILE\""
fi

echo ""
echo "========================================"
echo -e "${GREEN}FinBot installation complete!${NC}"
echo "========================================"
echo ""
echo "Installed plugins:"
for plugin in market audit guard rate-limit; do
  echo "  - finbot-$plugin"
done
echo ""
echo "Installed skills:"
ls -1 "$SKILLS_DIR" 2>/dev/null || echo "  (none)"
echo ""
echo "Configuration file: $ENV_FILE"
echo ""
echo "Next steps:"
echo "  1. Ensure env vars are loaded: source $ENV_FILE"
echo "  2. Restart OpenClaw: openclaw restart"
