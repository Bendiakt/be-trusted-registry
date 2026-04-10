#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
SERVICE_NAME="${SERVICE_NAME:-be-trusted-registry}"
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY_SEC="${RETRY_DELAY_SEC:-10}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
NTFY_TOPIC="${NTFY_TOPIC:-}"
DRY_RUN="${DRY_RUN:-0}"
FORCE_UNHEALTHY="${FORCE_UNHEALTHY:-0}"

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
  if [[ "${FORCE_UNHEALTHY}" == "1" ]]; then
    return 1
  fi
  curl -fsS --max-time 10 "${BACKEND_URL}/api/health" >/dev/null
}

safe_action() {
  local action="$1"
  shift
  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "[failover] DRY_RUN: would run railway ${action} $*"
    return 0
  fi
  NODE_TLS_REJECT_UNAUTHORIZED=0 "${ROOT_DIR}/scripts/railway-cli.sh" "${action}" "$@" >/dev/null
}

echo "[failover] checking health: ${BACKEND_URL}/api/health"
if health_ok; then
  echo "[failover] PASS: service healthy"
  exit 0
fi

echo "[failover] FAIL: service unhealthy, trying restart"
safe_action restart --service "${SERVICE_NAME}"
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
safe_action redeploy --service "${SERVICE_NAME}" --yes
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
