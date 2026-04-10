#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/be-registry-monitor.log}"
BACKEND_URL="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
RUN_STRIPE_CHECK="${RUN_STRIPE_CHECK:-0}"
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
# ntfy.sh push notifications — zero-setup, no account required
# Set NTFY_TOPIC to activate (e.g. "be-registry-prod-alerts-xyz123")
NTFY_TOPIC="${NTFY_TOPIC:-}"

send_slack_alert() {
  local text="$1"
  if [[ -z "${SLACK_WEBHOOK_URL}" ]]; then
    return 0
  fi

  curl -sS -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"${text}\"}" >/dev/null || true
}

send_ntfy_alert() {
  local text="$1"
  if [[ -z "${NTFY_TOPIC}" ]]; then
    return 0
  fi
  curl -sS -X POST "https://ntfy.sh/${NTFY_TOPIC}" \
    -H "Title: be-registry ALERT" \
    -H "Priority: urgent" \
    -H "Tags: warning,production" \
    -d "${text}" >/dev/null || true
}

send_email_alert() {
  local text="$1"
  if [[ -z "${ALERT_EMAIL_TO}" ]]; then
    return 0
  fi

  if command -v mail >/dev/null 2>&1; then
    printf "%s\n" "${text}" | mail -s "[be-registry] Production monitor alert" "${ALERT_EMAIL_TO}" || true
  fi
}

run_check() {
  BACKEND_URL="${BACKEND_URL}" RUN_STRIPE_CHECK="${RUN_STRIPE_CHECK}" \
    "${ROOT_DIR}/scripts/monitor-prod.sh"
}

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if output="$(run_check 2>&1)"; then
  printf "%s [OK] %s\n%s\n" "${timestamp}" "monitor-prod passed" "${output}" | tee -a "${LOG_FILE}"
  exit 0
fi

message="${timestamp} [FAIL] monitor-prod failed\n${output}"
printf "%b\n" "${message}" | tee -a "${LOG_FILE}"
send_slack_alert "${message}"
send_ntfy_alert "${message}"
send_email_alert "${message}"
exit 1
