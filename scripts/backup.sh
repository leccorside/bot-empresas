#!/bin/sh
set -eu
STAMP=$(date +%Y%m%d_%H%M%S)
DEST=/storage/backups/prospector_${STAMP}.sql.gz
export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dump -h postgres -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${DEST}"
find /storage/backups -name 'prospector_*.sql.gz' -mtime "+${BACKUP_RETENTION_DAYS:-30}" -delete
echo "Backup criado: ${DEST}"
