#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
RAILWAY_SERVICE="${RAILWAY_SERVICE:-be-trusted-registry}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"

# 1) Validate auth + live checkout session generation
BACKEND_URL="${BACKEND_URL}" RUN_STRIPE_CHECK=1 "${ROOT_DIR}/scripts/monitor-prod.sh"

# 2) Validate webhook endpoint is reachable and signature-protected
webhook_status="$(curl -s -o /tmp/be-registry-webhook-check.out -w "%{http_code}" \
  -X POST "${BACKEND_URL%/}/api/payments/webhook" \
  -H "Content-Type: application/json" \
  --data '{"id":"evt_fake","type":"checkout.session.completed"}')"

if [[ "${webhook_status}" != "400" ]]; then
  echo "FAIL: webhook endpoint should reject unsigned payload with HTTP 400, got ${webhook_status}"
  cat /tmp/be-registry-webhook-check.out || true
  exit 1
fi

echo "PASS: webhook endpoint is active and signature verification works"

# 3) Attempt to find a real completed webhook in recent logs (non-blocking)
set +e
recent_webhook_logs="$(${ROOT_DIR}/scripts/railway-cli.sh logs --service "${RAILWAY_SERVICE}" --environment "${RAILWAY_ENVIRONMENT}" --since 1d --filter "Payment confirmed:" 2>/dev/null)"
set -e

if [[ -n "${recent_webhook_logs}" ]]; then
  echo "PASS: Found recent real webhook completion logs"
else
  echo "WARN: No recent 'Payment confirmed:' logs found in last 24h."
  echo "Manual step: complete one live payment in Stripe Checkout and re-run this script to verify end-to-end webhook completion."
fi
