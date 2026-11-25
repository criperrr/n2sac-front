# syntax=docker/dockerfile:1

FROM node:22-alpine AS web-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts capacitor.config.ts ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

FROM nginx:1.27-alpine AS runtime
RUN sed -i 's/worker_processes  auto;/worker_processes  2;/' /etc/nginx/nginx.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/nginx-health >/dev/null || exit 1
