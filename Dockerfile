# ── Build stage ──────────────────────────────────────────────────────────────
FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist/index.html /usr/share/nginx/html/index.html

EXPOSE 80
