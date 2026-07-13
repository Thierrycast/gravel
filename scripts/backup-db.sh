#!/usr/bin/env bash
# Backup seguro do banco SQLite de produção do Gravel.
#
# Usa o Online Backup API do SQLite (".backup") dentro de um container
# descartável que monta o volume Docker — consistente mesmo com o app
# escrevendo no banco, sem precisar de root no host nem parar o app.
#
# Uso:      ./scripts/backup-db.sh
# Config:   GRAVEL_DB_VOLUME   volume Docker com o banco (default: gravel_gravel_data)
#           GRAVEL_DB_FILE     nome do arquivo no volume  (default: prod.db)
#           GRAVEL_BACKUP_DIR  destino no host            (default: ~/backups/gravel)
#           GRAVEL_BACKUP_KEEP quantos backups manter     (default: 14)
set -euo pipefail

VOLUME="${GRAVEL_DB_VOLUME:-gravel_gravel_data}"
DB_FILE="${GRAVEL_DB_FILE:-prod.db}"
BACKUP_DIR="${GRAVEL_BACKUP_DIR:-$HOME/backups/gravel}"
KEEP="${GRAVEL_BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="prod-${STAMP}.db"

mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v "${VOLUME}:/data" \
  -v "${BACKUP_DIR}:/backup" \
  alpine:3 sh -ceu "
    apk add --no-cache sqlite >/dev/null
    sqlite3 /data/${DB_FILE} \".backup '/backup/${OUT}'\"
    sqlite3 /backup/${OUT} 'PRAGMA integrity_check;' | grep -qx ok
    gzip /backup/${OUT}
    chown $(id -u):$(id -g) /backup/${OUT}.gz
  "

# Rotação: mantém os $KEEP mais recentes
ls -1t "$BACKUP_DIR"/prod-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --

echo "OK: ${BACKUP_DIR}/${OUT}.gz ($(du -h "${BACKUP_DIR}/${OUT}.gz" | cut -f1))"
