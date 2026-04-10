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
