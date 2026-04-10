#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEEP_TMP_DB="${KEEP_TMP_DB:-0}"

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  # Try Homebrew libpq on macOS if not already in PATH
  if [[ -x "/usr/local/opt/libpq/bin/psql" ]]; then
    export PATH="/usr/local/opt/libpq/bin:$PATH"
  elif [[ -x "/opt/homebrew/opt/libpq/bin/psql" ]]; then
    export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
  fi
fi

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  echo "FAIL: psql/pg_restore not found"
  echo "Install: brew install libpq && brew link --force libpq"
  exit 1
fi

DUMP_FILE="${1:-$(ls -1t "${ROOT_DIR}"/backups/be-registry-*.dump 2>/dev/null | head -1)}"
if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "FAIL: no dump file found"
  echo "Usage: $0 /path/to/backup.dump"
  exit 1
fi

# Prefer DATABASE_PUBLIC_URL for local dry-runs. Fallback to DATABASE_URL when explicitly provided.
TARGET_URL="${DATABASE_PUBLIC_URL:-${DATABASE_URL:-}}"
if [[ -z "${TARGET_URL}" ]]; then
  if command -v railway >/dev/null 2>&1; then
    TARGET_URL="$(NODE_TLS_REJECT_UNAUTHORIZED=0 railway variable list --service Postgres --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const o=JSON.parse(s||'{}');process.stdout.write(o.DATABASE_PUBLIC_URL||'');});")"
  fi
fi

if [[ -z "${TARGET_URL}" ]]; then
  echo "FAIL: missing DATABASE_PUBLIC_URL/DATABASE_URL"
  echo "Hint: export DATABASE_PUBLIC_URL=postgresql://..."
  exit 1
fi

if [[ "${TARGET_URL}" == *"railway.internal"* ]]; then
  echo "FAIL: TARGET_URL uses railway.internal (private DNS, not reachable locally)"
  echo "Use DATABASE_PUBLIC_URL from Railway Postgres service"
  exit 1
fi

read -r PGHOST PGPORT PGUSER PGPASSWORD PGDB <<< "$(URL="${TARGET_URL}" node -e "const u=new URL(process.env.URL);console.log([u.hostname,u.port||'5432',u.username,u.password,u.pathname.slice(1)].join(' '))")"
export PGHOST PGPORT PGUSER PGPASSWORD

# Cleanup stale temp DBs from interrupted runs
for db in $(psql -d "${PGDB}" -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'restore_tmp_%';"); do
  [[ -z "${db}" ]] && continue
  psql -d "${PGDB}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${db}';" >/dev/null
  psql -d "${PGDB}" -c "DROP DATABASE IF EXISTS ${db};" >/dev/null
  echo "Dropped stale ${db}"
done

TMP_DB="restore_tmp_$(date +%Y%m%d_%H%M%S)"
echo "Using dump: $(basename "${DUMP_FILE}")"
echo "Create temp DB: ${TMP_DB}"
psql -d "${PGDB}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TMP_DB};" >/dev/null

echo "Restore into temp DB..."
pg_restore --verbose --no-owner --no-privileges -d "${TMP_DB}" "${DUMP_FILE}" >/dev/null

echo "Verify restored counts..."
psql -d "${TMP_DB}" -Atc "SELECT 'users='||COUNT(*) FROM users; SELECT 'companies='||COUNT(*) FROM companies; SELECT 'missions='||COUNT(*) FROM missions;"

if [[ "${KEEP_TMP_DB}" == "1" ]]; then
  echo "KEEP_TMP_DB=1 -> leaving temp database: ${TMP_DB}"
  exit 0
fi

echo "Drop temp DB..."
psql -d "${PGDB}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TMP_DB}';" >/dev/null
psql -d "${PGDB}" -c "DROP DATABASE ${TMP_DB};" >/dev/null

echo "PASS: restore dry-run completed"
