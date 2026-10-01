# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=dist \
    DATABASE_PATH=/data/leaderboard.sqlite
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# The leaderboard lives in this volume: without it every deploy starts with an empty board.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8080
CMD ["node", "dist-server/server/main.js"]
