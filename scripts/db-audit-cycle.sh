#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_public_db_url() {
  if [[ -n "${DATABASE_PUBLIC_URL:-}" ]]; then
    printf '%s' "${DATABASE_PUBLIC_URL}"
    return 0
  fi

  if [[ -n "${DATABASE_URL:-}" && "${DATABASE_URL}" != *"railway.internal"* ]]; then
    printf '%s' "${DATABASE_URL}"
    return 0
  fi

  if command -v railway >/dev/null 2>&1; then
    NODE_TLS_REJECT_UNAUTHORIZED=0 railway variable list --service Postgres --json 2>/dev/null \
      | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const o=JSON.parse(s||'{}');process.stdout.write(o.DATABASE_PUBLIC_URL||'');});"
    return 0
  fi

  return 1
}

DB_URL="$(resolve_public_db_url || true)"
if [[ -z "${DB_URL}" ]]; then
  echo "FAIL: cannot resolve public PostgreSQL URL"
  echo "Hint: export DATABASE_PUBLIC_URL=postgresql://..."
  exit 1
fi

if [[ "${DB_URL}" == *"railway.internal"* ]]; then
  echo "FAIL: public URL required (got railway.internal)"
  exit 1
fi

export DATABASE_URL="${DB_URL}"
export DATABASE_PUBLIC_URL="${DB_URL}"

echo "[1/3] Running backup..."
bash "${ROOT_DIR}/scripts/db-backup.sh"

LATEST_DUMP="$(ls -1t "${ROOT_DIR}"/backups/be-registry-*.dump | head -1)"
if [[ -z "${LATEST_DUMP}" || ! -f "${LATEST_DUMP}" ]]; then
  echo "FAIL: backup step did not produce a dump"
  exit 1
fi

echo "[2/3] Running restore dry-run with $(basename "${LATEST_DUMP}")..."
bash "${ROOT_DIR}/scripts/db-restore-dry-run.sh" "${LATEST_DUMP}"

echo "[3/3] Audit summary"
SIZE="$(du -h "${LATEST_DUMP}" | awk '{print $1}')"
SUM="$(shasum -a 256 "${LATEST_DUMP}" | awk '{print $1}')"
echo "PASS: backup + restore dry-run succeeded"
echo "dump=$(basename "${LATEST_DUMP}") size=${SIZE} sha256=${SUM}"
