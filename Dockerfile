FROM node:24-bookworm-slim

WORKDIR /app

# Install OpenClaw globally
RUN npm install -g openclaw

# Copy plugin source and build
COPY plugins/finbot-market/package.json plugins/finbot-market/tsconfig.json plugins/finbot-market/openclaw.plugin.json plugins/finbot-market/
COPY plugins/finbot-market/src/ plugins/finbot-market/src/

RUN cd plugins/finbot-market && npm install && npm run build && npm run test:ci

COPY plugins/finbot-audit/package.json plugins/finbot-audit/tsconfig.json plugins/finbot-audit/openclaw.plugin.json plugins/finbot-audit/
COPY plugins/finbot-audit/src/ plugins/finbot-audit/src/

RUN cd plugins/finbot-audit && npm install && npm run build && npm run test:ci

# Copy built-in skills
COPY skills/ /app/skills/

# Copy workspace bootstrap files (persona, user profile)
COPY AGENTS.md USER.md ./

# Config template (copied to volume on first run)
COPY openclaw.json /app/openclaw.json.template

# Entrypoint: inject plugin path into config on first run
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

VOLUME /root/.openclaw

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["openclaw", "gateway"]
