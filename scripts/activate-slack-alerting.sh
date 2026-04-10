#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-${1:-}}"

if [[ -z "${SLACK_WEBHOOK_URL}" ]]; then
  echo "Usage: SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...' $0"
  echo "or: $0 'https://hooks.slack.com/services/...'"
  exit 1
fi

if [[ "${SLACK_WEBHOOK_URL}" != https://hooks.slack.com/services/* ]]; then
  echo "FAIL: invalid Slack webhook format"
  exit 1
fi

echo "Installing monitor LaunchAgent with Slack..."
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" bash "${ROOT_DIR}/scripts/install-monitor-launchagent.sh"

echo "Installing DB audit LaunchAgent with Slack..."
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" bash "${ROOT_DIR}/scripts/install-audit-launchagent.sh"

echo "Sending Slack test message..."
curl -sS -X POST "${SLACK_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"be-registry: Slack alerting is now active for monitor + db audit.\"}" >/dev/null

echo "PASS: Slack alerting activated"
