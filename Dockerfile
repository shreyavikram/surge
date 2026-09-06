# SURGE: one container serves the web client and the /api server.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY data ./data
RUN npm ci
RUN npm run build -w @surge/web

FROM node:24-alpine AS run
WORKDIR /app
COPY --from=build /app ./
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npx", "tsx", "apps/server/src/index.ts"]
