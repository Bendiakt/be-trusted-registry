#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_SCHEDULE="${CRON_SCHEDULE:-*/5 * * * *}"
MONITOR_BACKEND_URL="${MONITOR_BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
RUN_STRIPE_CHECK="${RUN_STRIPE_CHECK:-0}"
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

cron_env="BACKEND_URL=${MONITOR_BACKEND_URL} RUN_STRIPE_CHECK=${RUN_STRIPE_CHECK} ALERT_EMAIL_TO=${ALERT_EMAIL_TO} SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}"
cron_cmd="cd ${ROOT_DIR} && ${cron_env} ./scripts/monitor-and-alert.sh >> /tmp/be-registry-monitor-cron.log 2>&1"
cron_line="${CRON_SCHEDULE} ${cron_cmd} # be-registry-monitor"

existing="$(crontab -l 2>/dev/null || true)"
cleaned="$(printf "%s\n" "${existing}" | sed '/# be-registry-monitor$/d')"
{
  printf "%s\n" "${cleaned}"
  printf "%s\n" "${cron_line}"
} | crontab -

echo "Installed cron job: ${cron_line}"
