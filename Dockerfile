FROM node:24-bookworm-slim

WORKDIR /app

# 安装 OpenClaw（全局）
RUN npm install -g openclaw

# 配置模板（不放在 volume 挂载点）
COPY openclaw.json /app/openclaw.json.template

# 复制插件
COPY plugins/finbot-market/package.json plugins/finbot-market/tsconfig.json plugins/finbot-market/openclaw.plugin.json plugins/finbot-market/
COPY plugins/finbot-market/src/ plugins/finbot-market/src/

# 构建 plugin TypeScript
RUN cd plugins/finbot-market && npm install && npm run build

# 入口脚本：首次运行时复制配置
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

VOLUME /root/.openclaw

EXPOSE 18789

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["openclaw", "gateway"]
