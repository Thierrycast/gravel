#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[gravel] ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

# For SQLite URLs (file:...), ensure the parent directory exists and is writable.
case "$DATABASE_URL" in
  file:*)
    DB_PATH=${DATABASE_URL#file:}
    DB_DIR=$(dirname "$DB_PATH")
    mkdir -p "$DB_DIR" 2>/dev/null || true
    chown -R nextjs:nodejs "$DB_DIR" 2>/dev/null || true
    ;;
esac

# Ensure data directory exists and has correct permissions
mkdir -p /app/data 2>/dev/null || true
chown -R nextjs:nodejs /app/data 2>/dev/null || true

# Apply schema — ideal for homelab/personal use. For formal migrations, replace
# with: prisma migrate deploy
echo "[gravel] Applying database schema..."
su-exec nextjs prisma db push --skip-generate

echo "[gravel] Starting Gravel Finance on :${PORT:-3000}..."
exec su-exec nextjs node server.js
