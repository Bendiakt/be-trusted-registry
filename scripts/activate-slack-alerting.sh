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

if [[ "${SLACK_WEBHOOK_URL}" == *"/XXX/YYY/ZZZ"* ]]; then
  echo "FAIL: placeholder webhook detected (XXX/YYY/ZZZ)"
  exit 1
fi

echo "Sending Slack test message..."
SLACK_RESP="$(curl -sS -X POST "${SLACK_WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"be-registry: validating Slack webhook before activation.\"}")"

if [[ "${SLACK_RESP}" != "ok" ]]; then
  echo "FAIL: Slack webhook test failed: ${SLACK_RESP}"
  exit 1
fi

echo "Installing monitor LaunchAgent with Slack..."
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" bash "${ROOT_DIR}/scripts/install-monitor-launchagent.sh"

echo "Installing DB audit LaunchAgent with Slack..."
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL}" bash "${ROOT_DIR}/scripts/install-audit-launchagent.sh"

echo "PASS: Slack alerting activated"
