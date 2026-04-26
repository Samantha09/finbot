FROM node:24-bookworm-slim

WORKDIR /app

# 安装 OpenClaw
RUN npm install -g openclaw

# 复制项目配置
COPY agents.yaml config.yaml package.json ./
COPY plugins/ plugins/

# 安装项目依赖
RUN npm install --production

# 持久化数据目录
VOLUME /home/node/.openclaw

EXPOSE 18789

CMD ["openclaw", "start"]
