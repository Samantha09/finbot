FROM node:24-bookworm-slim

WORKDIR /app

# 安装 OpenClaw（全局）
RUN npm install -g openclaw

# 配置模板
COPY openclaw.json /app/openclaw.json.template

# FinBot workspace 模板（persona、identity、用户画像）
COPY workspace/ /app/workspace-template/

# 复制插件
COPY plugins/finbot-market/package.json plugins/finbot-market/tsconfig.json plugins/finbot-market/openclaw.plugin.json plugins/finbot-market/
COPY plugins/finbot-market/src/ plugins/finbot-market/src/

# 构建 plugin TypeScript
RUN cd plugins/finbot-market && npm install && npm run build

# 入口脚本
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

VOLUME /root/.openclaw

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["openclaw", "gateway"]
