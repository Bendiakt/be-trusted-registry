#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_file.dump>"
  echo "Optional env: FORCE=1 to skip confirmation"
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "FAIL: backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "FAIL: DATABASE_URL is not set"
  echo "Hint: export DATABASE_URL=postgresql://..."
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "FAIL: pg_restore not found"
  echo "Install PostgreSQL client tools (macOS: brew install libpq && brew link --force libpq)"
  exit 1
fi

if [[ "${FORCE:-0}" != "1" ]]; then
  echo "WARNING: this will modify the target database in DATABASE_URL."
  echo "backup_file=${BACKUP_FILE}"
  read -r -p "Type RESTORE to continue: " confirm
  if [[ "${confirm}" != "RESTORE" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "Restoring PostgreSQL backup..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "${DATABASE_URL}" \
  "${BACKUP_FILE}"

echo "PASS: restore completed"
