#!/bin/sh
set -eu
while true; do
  TODAY=$(date +%Y%m%d)
  HOUR=$(date +%H)
  MARKER="/storage/backups/.last_${TODAY}"
  if [ "$HOUR" = "04" ] && [ ! -f "$MARKER" ]; then
    sh /scripts/backup.sh && touch "$MARKER"
  fi
  find /storage/backups -name '.last_*' -mtime +2 -delete
  sleep 300
done
