#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
TS="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_FILE="${OUT_DIR}/be-registry-${TS}.dump"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "FAIL: DATABASE_URL is not set"
  echo "Hint: export DATABASE_URL=postgresql://... or source backend/.env"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "FAIL: pg_dump not found"
  echo "Install PostgreSQL client tools (macOS: brew install libpq && brew link --force libpq)"
  exit 1
fi

mkdir -p "${OUT_DIR}"

echo "Creating PostgreSQL backup..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "${OUT_FILE}" \
  "${DATABASE_URL}"

if command -v shasum >/dev/null 2>&1; then
  SUM="$(shasum -a 256 "${OUT_FILE}" | awk '{print $1}')"
  echo "SHA256: ${SUM}"
fi

SIZE="$(du -h "${OUT_FILE}" | awk '{print $1}')"
echo "PASS: backup created"
echo "file=${OUT_FILE}"
echo "size=${SIZE}"

# Rotate old backups (keep most recent KEEP_BACKUPS, default 7)
KEEP="${KEEP_BACKUPS:-7}"
if [[ "${KEEP}" -gt 0 ]]; then
  # list dumps oldest first, delete all but the last $KEEP
  mapfile -t old_dumps < <(ls -1t "${OUT_DIR}"/be-registry-*.dump 2>/dev/null | tail -n +$((KEEP + 1)))
  if [[ "${#old_dumps[@]}" -gt 0 ]]; then
    echo "Rotating ${#old_dumps[@]} old dump(s) (keeping last ${KEEP})"
    for f in "${old_dumps[@]}"; do
      rm -f "${f}"
      echo "  removed: $(basename "${f}")"
    done
  fi
fi
