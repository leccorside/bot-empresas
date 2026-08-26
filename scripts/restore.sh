#!/bin/sh
set -eu
if [ "${1:-}" = "--verify-only" ]; then shift; exec sh /scripts/verify-restore.sh "$@"; fi
if [ -z "${1:-}" ] || [ ! -f "$1" ]; then echo "Uso: restore.sh [--verify-only] /storage/backups/arquivo.sql.gz"; exit 2; fi
gzip -t "$1"
echo "ATENÇÃO: restauração substitui objetos existentes do banco ${POSTGRES_DB}."
export PGPASSWORD="${POSTGRES_PASSWORD}"
gunzip -c "$1" | psql -h postgres -U "${POSTGRES_USER}" "${POSTGRES_DB}"
