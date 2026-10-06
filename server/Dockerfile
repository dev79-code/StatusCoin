# Build context: repository root  (docker build -f server/Dockerfile .)
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w server -w @status/core --include-workspace-root --ignore-scripts --no-audit --no-fund
COPY packages/core packages/core
COPY server server
RUN npm run build -w server

FROM node:22-slim
ENV NODE_ENV=production NODE_NO_WARNINGS=1
WORKDIR /app
COPY --from=build /app/server/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
