# FinBot Installer

Pre-built install package for Ubuntu x86_64 with existing OpenClaw (global npm install).

## Build

From repo root:

```bash
bash scripts/build-installer.sh
```

This builds all 4 plugins, runs tests, and produces `dist/finbot-installer-x86_64.tar.gz`.

## Prerequisites

- Ubuntu x86_64
- Node.js 20+
- OpenClaw installed globally: `npm install -g openclaw`
- Your OpenClaw already configured with LLM API keys and models

## Install

```bash
tar -xzf finbot-installer-x86_64.tar.gz
cd finbot-installer
./install.sh
```

## What the installer does

1. Copies 4 FinBot plugins into OpenClaw's `extensions/` directory
2. Copies built-in skills to `~/.openclaw/workspace/skills/`
3. **Merges** FinBot config into your existing `~/.openclaw/openclaw.json`:
   - Adds plugin registrations (`plugins.allow`, `plugins.entries`)
   - Adds FinBot's system prompt rules (preserves your existing API keys and model settings)
   - Creates a backup of your original config
4. Prompts for `GF_SKILLS_APIKEY` and writes to `~/.openclaw/finbot.env`
5. Offers to auto-source the env file in your shell profile

## Required environment variable

GF 数据工具需要 `GF_SKILLS_APIKEY`。安装脚本会交互式提示输入，也可以预先填好同目录的 `finbot.env`：

```bash
# 先编辑
vim finbot-installer/finbot.env
# 填入 GF_SKILLS_APIKEY=your-key

# 再运行安装（会自动读取模板中的默认值）
./install.sh
```

生成后的配置文件位置：
```bash
~/.openclaw/finbot.env
```

## After install

```bash
source ~/.openclaw/finbot.env
openclaw restart
```

你的 LLM API 配置完全不动，只增加了 GF 数据服务的 Key。

## Troubleshooting

**Plugin not loading?** Check `openclaw.json` has the `finbot-*` entries under `plugins.allow` and `plugins.entries`.

**Want to revert?** The installer backs up your original `openclaw.json` with a `.backup.<timestamp>` suffix.
