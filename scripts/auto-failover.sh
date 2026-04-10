#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
SERVICE_NAME="${SERVICE_NAME:-be-trusted-registry}"
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY_SEC="${RETRY_DELAY_SEC:-10}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
NTFY_TOPIC="${NTFY_TOPIC:-}"

notify() {
  local title="$1"
  local msg="$2"

  if [[ -n "${NTFY_TOPIC}" ]]; then
    curl -sS -X POST "https://ntfy.sh/${NTFY_TOPIC}" \
      -H "Title: ${title}" \
      -H "Priority: urgent" \
      -H "Tags: rotating_light,production" \
      -d "${msg}" >/dev/null || true
  fi

  if [[ -n "${SLACK_WEBHOOK_URL}" ]]; then
    curl -sS -X POST "${SLACK_WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"${title}: ${msg}\"}" >/dev/null || true
  fi
}

health_ok() {
  curl -fsS --max-time 10 "${BACKEND_URL}/api/health" >/dev/null
}

echo "[failover] checking health: ${BACKEND_URL}/api/health"
if health_ok; then
  echo "[failover] PASS: service healthy"
  exit 0
fi

echo "[failover] FAIL: service unhealthy, trying restart"
NODE_TLS_REJECT_UNAUTHORIZED=0 "${ROOT_DIR}/scripts/railway-cli.sh" restart --service "${SERVICE_NAME}" >/dev/null
sleep "${RETRY_DELAY_SEC}"

for i in $(seq 1 "${MAX_RETRIES}"); do
  if health_ok; then
    msg="service recovered after restart (attempt ${i})"
    echo "[failover] PASS: ${msg}"
    notify "be-registry failover recovered" "${msg}"
    exit 0
  fi
  sleep "${RETRY_DELAY_SEC}"
done

echo "[failover] still unhealthy, trying redeploy"
NODE_TLS_REJECT_UNAUTHORIZED=0 "${ROOT_DIR}/scripts/railway-cli.sh" redeploy --service "${SERVICE_NAME}" --yes >/dev/null
sleep "${RETRY_DELAY_SEC}"

for i in $(seq 1 "${MAX_RETRIES}"); do
  if health_ok; then
    msg="service recovered after redeploy (attempt ${i})"
    echo "[failover] PASS: ${msg}"
    notify "be-registry failover recovered" "${msg}"
    exit 0
  fi
  sleep "${RETRY_DELAY_SEC}"
done

msg="service remains unhealthy after restart+redeploy"
echo "[failover] CRITICAL: ${msg}"
notify "be-registry failover critical" "${msg}"
exit 1
