FROM node:24-bookworm-slim

WORKDIR /app

# Install OpenClaw globally
RUN npm install -g openclaw

# Copy plugin source and build
COPY plugins/finbot-market/package.json plugins/finbot-market/tsconfig.json plugins/finbot-market/openclaw.plugin.json plugins/finbot-market/
COPY plugins/finbot-market/src/ plugins/finbot-market/src/

RUN cd plugins/finbot-market && npm install && npm run build && npm run test:ci
RUN cp -r plugins/finbot-market /usr/local/lib/node_modules/openclaw/dist/extensions/finbot-market

COPY plugins/finbot-audit/package.json plugins/finbot-audit/tsconfig.json plugins/finbot-audit/openclaw.plugin.json plugins/finbot-audit/
COPY plugins/finbot-audit/src/ plugins/finbot-audit/src/

RUN cd plugins/finbot-audit && npm install && npm run build && npm run test:ci
RUN cp -r plugins/finbot-audit /usr/local/lib/node_modules/openclaw/dist/extensions/finbot-audit

COPY plugins/finbot-guard/package.json plugins/finbot-guard/tsconfig.json plugins/finbot-guard/openclaw.plugin.json plugins/finbot-guard/
COPY plugins/finbot-guard/src/ plugins/finbot-guard/src/

RUN cd plugins/finbot-guard && npm install && npm run build && npm run test:ci
RUN cp -r plugins/finbot-guard /usr/local/lib/node_modules/openclaw/dist/extensions/finbot-guard

COPY plugins/finbot-rate-limit/package.json plugins/finbot-rate-limit/tsconfig.json plugins/finbot-rate-limit/openclaw.plugin.json plugins/finbot-rate-limit/
COPY plugins/finbot-rate-limit/src/ plugins/finbot-rate-limit/src/

RUN cd plugins/finbot-rate-limit && npm install && npm run build && npm run test:ci
RUN cp -r plugins/finbot-rate-limit /usr/local/lib/node_modules/openclaw/dist/extensions/finbot-rate-limit

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
