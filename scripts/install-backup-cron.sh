#!/usr/bin/env bash
# Install a daily automated PostgreSQL backup cron job.
# Usage: [BACKUP_SCHEDULE="0 3 * * *"] [KEEP_BACKUPS=7] [DATABASE_URL=...] ./scripts/install-backup-cron.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_TAG="# be-registry-backup"
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 3 * * *}"   # default: 03:00 UTC daily
KEEP="${KEEP_BACKUPS:-7}"
CRON_LOG="/tmp/be-registry-backup-cron.log"

if [[ -n "${DATABASE_URL:-}" ]]; then
  DB_ENV="DATABASE_URL='${DATABASE_URL}' "
else
  echo "WARNING: DATABASE_URL is not set – the cron job will need it at runtime."
  echo "  Pass it via: DATABASE_URL='postgresql://...' ./scripts/install-backup-cron.sh"
  DB_ENV=""
fi

CRON_LINE="${BACKUP_SCHEDULE} cd ${ROOT_DIR} && ${DB_ENV}KEEP_BACKUPS=${KEEP} ./scripts/db-backup.sh >> ${CRON_LOG} 2>&1 ${CRON_TAG}"

# Write crontab via temp file (more reliable than piping on macOS)
TMPFILE="$(mktemp /tmp/crontab-be-registry-XXXXXX)"
trap 'rm -f "${TMPFILE}"' EXIT

crontab -l 2>/dev/null | grep -v "${CRON_TAG}" > "${TMPFILE}" || true
printf '%s\n' "${CRON_LINE}" >> "${TMPFILE}"
crontab "${TMPFILE}"

echo "PASS: backup cron installed"
echo "schedule: ${BACKUP_SCHEDULE} (daily 03:00 UTC by default)"
echo "retention: last ${KEEP} dumps"
echo "log: ${CRON_LOG}"
echo ""
echo "Cron line installed:"
echo "  ${CRON_LINE}"
