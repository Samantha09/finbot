FROM node:24-bookworm-slim

# Install OpenClaw globally (simulate user environment)
RUN npm install -g openclaw

# Create workspace for testing
WORKDIR /test

# Copy installer
COPY finbot-installer-x86_64.tar.gz .
RUN tar -xzf finbot-installer-x86_64.tar.gz

# Pre-fill GF key to test auto-read
RUN sed -i 's/GF_SKILLS_APIKEY=/GF_SKILLS_APIKEY=test-gf-key-12345/' finbot-installer/finbot.env

# Run installer
WORKDIR /test/finbot-installer
RUN ./install.sh

# Verify results
RUN echo "=== ~/.openclaw/openclaw.json ===" && cat ~/.openclaw/openclaw.json | head -50
RUN echo "=== ~/.openclaw/finbot.env ===" && cat ~/.openclaw/finbot.env
RUN echo "=== Extensions ===" && ls -la /usr/local/lib/node_modules/openclaw/dist/extensions/
RUN echo "=== Skills ===" && ls -la ~/.openclaw/workspace/skills/
RUN echo "=== bashrc source ===" && grep finbot ~/.bashrc || echo "NOT FOUND IN BASHRC"
