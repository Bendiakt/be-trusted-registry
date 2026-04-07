#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${BACKEND_URL:-}" || -z "${FRONTEND_URL:-}" ]]; then
  echo "Usage: BACKEND_URL=https://... FRONTEND_URL=https://... $0"
  exit 1
fi

backend="${BACKEND_URL%/}"
frontend="${FRONTEND_URL%/}"

echo "[1/5] Backend health"
curl -fsS "$backend/api/health" | cat

echo "\n[2/5] Frontend headers"
curl -fsSI "$frontend" | head -n 1 | cat

echo "\n[3/5] Verify route"
curl -fsSI "$frontend/verify/1" | head -n 1 | cat

echo "\n[4/5] Payment endpoint returns URL"
payment_json="$(curl -fsS -X POST "$backend/api/payments/create-checkout-session" -H "Content-Type: application/json" -d '{"planId":"level1"}')"
echo "$payment_json" | cat

if ! echo "$payment_json" | grep -q '"url"'; then
  echo "Payment endpoint did not return a checkout URL"
  exit 1
fi

echo "\n[5/5] Done: core smoke tests passed"
