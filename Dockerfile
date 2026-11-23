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
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/dist /usr/share/nginx/html
EXPOSE 8080
