# SURGE web prototype. Multi-stage: build the Vite client, serve the static
# bundle with a zero-dep Node server. Plan 2 replaces the run stage with the
# Hono server (client + /api in one image).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci
RUN npm run build -w @surge/web

FROM node:24-alpine AS run
WORKDIR /app
COPY --from=build /app/apps/web/dist ./dist
COPY apps/web/serve.mjs ./serve.mjs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "serve.mjs"]
