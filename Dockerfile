# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Stage 1 — Install deps (cache-friendly)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy prisma schema early so postinstall (prisma generate) works
COPY prisma ./prisma/

RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2 — Build (isolated)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install esbuild temporarily to bundle MCP and CLI for standalone runtime
RUN npm install -g esbuild

# Final production build
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/tmp/gravel-build.db
ENV NEXT_BUILD_CPUS=1
RUN corepack enable pnpm && pnpm build

# Bundle MCP and CLI to pure JS into the standalone directory
RUN esbuild mcp/server.ts --bundle --platform=node --target=node20 --external:@prisma/client --external:next --external:bcrypt --outfile=.next/standalone/mcp.js && \
    esbuild cli/index.ts --bundle --platform=node --target=node20 --external:@prisma/client --external:next --external:bcrypt --outfile=.next/standalone/cli.js

# ---------------------------------------------------------------------------
# Stage 3 — Production Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl su-exec wget
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user early so COPY --chown works and the entrypoint can drop
# privileges after preparing the writable SQLite volume.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/.next /app/data \
  && chown -R nextjs:nodejs /app

# Copy static assets and optimized build
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/entrypoint.sh ./entrypoint.sh

# Prisma CLI is required at boot time for `prisma db push`.
RUN npm install -g prisma@6.19.0 \
  && chmod +x ./entrypoint.sh \
  && npm cache clean --force

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready > /dev/null || exit 1

ENTRYPOINT ["./entrypoint.sh"]
