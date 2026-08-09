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
#
# Deliberadamente SEM --accept-data-loss: o flag transformaria qualquer remoção
# acidental de campo em perda silenciosa de dado. Em troca, uma mudança
# destrutiva de schema falha aqui — e sem a mensagem abaixo o container só
# entrava em loop de restart sem explicar o motivo (aconteceu em 2026-08-09 ao
# remover `UserSetting.syncIntervalHours`).
echo "[gravel] Applying database schema..."
if ! su-exec nextjs prisma db push --skip-generate; then
  cat >&2 <<'MSG'

[gravel] ERRO: o schema não pôde ser aplicado.

Se o motivo acima for perda de dado (remoção de coluna/tabela), isto é
intencional: o push é estrito de propósito. Aplique a mudança destrutiva uma
vez, com os olhos abertos, e faça backup antes:

  docker run --rm -v gravel_gravel_data:/data -v "$PWD":/b alpine \
    cp /data/prod.db /b/prod.db.bak
  docker run --rm --entrypoint sh -v gravel_gravel_data:/app/data \
    -e DATABASE_URL=file:/app/data/prod.db gravel:0.1.0 \
    -c 'prisma db push --skip-generate --accept-data-loss'

MSG
  exit 1
fi

# Start MCP Server in the background via SSE
echo "[gravel] Starting MCP Server (SSE) on port 3001..."
MCP_BIND_HOST=0.0.0.0 PORT=3001 su-exec nextjs node mcp.js --sse &

echo "[gravel] Starting Gravel Finance on :${PORT:-3000}..."
exec su-exec nextjs node server.js
