# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Stage 1 — Install deps (cache-friendly)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

# libc6-compat: required for some native Node modules on Alpine
# openssl: required by Prisma engines at runtime and build-time
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2 — Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl
RUN corepack enable pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/tmp/gravel-build.db

# Generate Prisma Client + Next.js standalone build
RUN pnpm exec prisma generate \
  && pnpm run build

# ---------------------------------------------------------------------------
# Stage 3 — Runtime (minimal image)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl wget

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user early so COPY --chown works in one layer
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/.next /app/data \
  && chown -R nextjs:nodejs /app

# Standalone output from Next.js (includes minimal node_modules + server.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/entrypoint.sh ./entrypoint.sh

# Prisma CLI needed only to push the schema at boot time
RUN npm install -g prisma@6.19.0 \
  && chmod +x ./entrypoint.sh \
  && npm cache clean --force

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ > /dev/null || exit 1

ENTRYPOINT ["./entrypoint.sh"]
