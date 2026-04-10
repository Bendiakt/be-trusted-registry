#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${LOG_FILE:-/tmp/be-registry-db-audit.log}"
NTFY_TOPIC="${NTFY_TOPIC:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
AUDIT_NOTIFY_SUCCESS="${AUDIT_NOTIFY_SUCCESS:-0}"

send_ntfy_alert() {
  local title="$1"
  local text="$2"
  local priority="${3:-default}"
  if [[ -z "${NTFY_TOPIC}" ]]; then
    return 0
  fi

  curl -sS -X POST "https://ntfy.sh/${NTFY_TOPIC}" \
    -H "Title: ${title}" \
    -H "Priority: ${priority}" \
    -H "Tags: database,backup" \
    -d "${text}" >/dev/null || true
}

send_slack_alert() {
  local text="$1"
  if [[ -z "${SLACK_WEBHOOK_URL}" ]]; then
    return 0
  fi

  curl -sS -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"${text}\"}" >/dev/null || true
}

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if output="$(bash "${ROOT_DIR}/scripts/db-audit-cycle.sh" 2>&1)"; then
  printf "%s [OK] db-audit-cycle passed\n%s\n" "${timestamp}" "${output}" | tee -a "${LOG_FILE}"
  if [[ "${AUDIT_NOTIFY_SUCCESS}" == "1" ]]; then
    send_ntfy_alert "be-registry DB audit OK" "${timestamp} db-audit-cycle passed" "default"
  fi
  exit 0
fi

message="${timestamp} [FAIL] db-audit-cycle failed\n${output}"
printf "%b\n" "${message}" | tee -a "${LOG_FILE}"
send_ntfy_alert "be-registry DB audit FAIL" "${message}" "urgent"
send_slack_alert "${message}"
exit 1
