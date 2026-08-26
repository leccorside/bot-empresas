#!/bin/sh
set -eu
MARKER=/storage/backups/.last_verified
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
[ -s "$MARKER" ] || { echo "Nenhum backup verificado"; exit 1; }
ARCHIVE=$(cut -d '|' -f 2- "$MARKER")
[ -f "$ARCHIVE" ] || { echo "Arquivo do último backup não existe: $ARCHIVE"; exit 1; }
gzip -t "$ARCHIVE"
NOW=$(date +%s)
MODIFIED=$(stat -c %Y "$MARKER")
AGE=$((NOW - MODIFIED))
[ "$AGE" -le $((MAX_AGE_HOURS * 3600)) ] || { echo "Último backup verificado está obsoleto: ${AGE}s"; exit 1; }
echo "Backup íntegro e recente: $ARCHIVE"
