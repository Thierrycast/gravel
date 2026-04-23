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
    ;;
esac

# Apply schema — ideal for homelab/personal use. For formal migrations, replace
# with: prisma migrate deploy
echo "[gravel] Applying database schema..."
prisma db push --skip-generate --accept-data-loss=false

echo "[gravel] Starting Gravel Finance on :${PORT:-3000}..."
exec node server.js
