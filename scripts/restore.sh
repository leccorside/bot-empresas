#!/bin/sh
set -eu
if [ -z "${1:-}" ] || [ ! -f "$1" ]; then echo "Uso: restore.sh /storage/backups/arquivo.sql.gz"; exit 2; fi
echo "ATENÇÃO: restauração substitui objetos existentes do banco ${POSTGRES_DB}."
export PGPASSWORD="${POSTGRES_PASSWORD}"
gunzip -c "$1" | psql -h postgres -U "${POSTGRES_USER}" "${POSTGRES_DB}"
