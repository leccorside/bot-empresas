#!/bin/sh
set -eu
ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then echo "Uso: verify-restore.sh /storage/backups/arquivo.sql.gz"; exit 2; fi
gzip -t "$ARCHIVE"
export PGPASSWORD="${POSTGRES_PASSWORD}"
VERIFY_DB="prospector_verify_$(date +%s)_$$"
cleanup() { dropdb -h postgres -U "${POSTGRES_USER}" --if-exists "$VERIFY_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
createdb -h postgres -U "${POSTGRES_USER}" "$VERIFY_DB"
gunzip -c "$ARCHIVE" | psql -v ON_ERROR_STOP=1 -h postgres -U "${POSTGRES_USER}" "$VERIFY_DB" >/dev/null
psql -v ON_ERROR_STOP=1 -h postgres -U "${POSTGRES_USER}" "$VERIFY_DB" -c 'SELECT 1 FROM "User" LIMIT 1' >/dev/null
echo "Restauração verificada em banco temporário: ${VERIFY_DB}"
