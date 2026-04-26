FROM node:24-bookworm-slim

WORKDIR /app

# 安装 OpenClaw（全局）
RUN npm install -g openclaw

# 复制项目文件
COPY agents.yaml config.yaml ./
COPY plugins/finbot-market/package.json plugins/finbot-market/tsconfig.json plugins/finbot-market/openclaw.plugin.json plugins/finbot-market/
COPY plugins/finbot-market/src/ plugins/finbot-market/src/

# 构建 plugin TypeScript
RUN cd plugins/finbot-market && npm install && npm run build

# 持久化数据目录
VOLUME /home/node/.openclaw

EXPOSE 18789

CMD ["openclaw", "start"]
