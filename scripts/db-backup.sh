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
  # Try libpq from Homebrew if not in PATH
  if [[ -x "/usr/local/opt/libpq/bin/pg_dump" ]]; then
    export PATH="/usr/local/opt/libpq/bin:$PATH"
  elif [[ -x "/opt/homebrew/opt/libpq/bin/pg_dump" ]]; then
    export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
  else
    echo "FAIL: pg_dump not found"
    echo "Install PostgreSQL client tools (macOS: brew install libpq && brew link --force libpq)"
    exit 1
  fi
fi

# Detect Railway internal hostname — not accessible from outside Railway network
if [[ "${DATABASE_URL}" == *"railway.internal"* ]]; then
  echo "WARNING: DATABASE_URL points to postgres.railway.internal"
  echo "This hostname is only reachable inside the Railway private network."
  echo "To run backups from your local machine, activate the public endpoint:"
  echo "  Railway Dashboard → PostgreSQL service → Settings → Networking → Enable Public Networking"
  echo "  Then: DATABASE_URL='<public_url>' npm run db:backup"
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
  # list dumps oldest first, delete all but the last $KEEP (macOS bash 3 compatible)
  old_count=0
  while IFS= read -r f; do
    [[ -z "${f}" ]] && continue
    rm -f "${f}"
    old_count=$((old_count + 1))
    echo "  removed: $(basename "${f}")"
  done < <(ls -1t "${OUT_DIR}"/be-registry-*.dump 2>/dev/null | tail -n +$((KEEP + 1)))

  if [[ "${old_count}" -gt 0 ]]; then
    echo "Rotating ${old_count} old dump(s) (keeping last ${KEEP})"
  fi
fi
