#!/usr/bin/env bash
set -euo pipefail

backend="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
backend="${backend%/}"
max_ms="${MAX_HEALTH_MS:-1500}"
run_stripe_check="${RUN_STRIPE_CHECK:-1}"
stripe_check_mode="${STRIPE_CHECK_MODE:-live}"

echo "Monitoring target: ${backend}"

health_with_time="$(curl -sS -w "\n%{http_code} %{time_total}" "${backend}/api/health")"
health_body="$(echo "${health_with_time}" | head -n 1)"
status_line="$(echo "${health_with_time}" | tail -n 1)"
http_code="$(echo "${status_line}" | awk '{print $1}')"
time_total="$(echo "${status_line}" | awk '{print $2}')"
latency_ms="$(python3 - "${time_total}" << 'PY'
import sys
print(int(float(sys.argv[1]) * 1000))
PY
)"

echo "Health HTTP: ${http_code}"
echo "Health latency: ${latency_ms}ms"

if [[ "${http_code}" != "200" ]]; then
  echo "FAIL: /api/health did not return HTTP 200"
  exit 1
fi

python3 - << 'PY' "${health_body}" "${max_ms}" "${latency_ms}"
import json
import sys

body = sys.argv[1]
max_ms = int(sys.argv[2])
latency_ms = int(sys.argv[3])

try:
    data = json.loads(body)
except Exception as exc:
    print(f"FAIL: health payload is not valid JSON: {exc}")
    sys.exit(1)

required = ["status", "timestamp", "uptimeSec", "memory", "node", "env"]
missing = [k for k in required if k not in data]
if missing:
    print(f"FAIL: missing health fields: {missing}")
    sys.exit(1)

if data.get("status") != "ok":
    print("FAIL: status != ok")
    sys.exit(1)

mem = data.get("memory") or {}
for key in ["rss", "heapUsed", "heapTotal"]:
    if key not in mem:
        print(f"FAIL: memory.{key} is missing")
        sys.exit(1)

if latency_ms > max_ms:
    print(f"FAIL: health latency too high: {latency_ms}ms > {max_ms}ms")
    sys.exit(1)

print("PASS: health payload and latency checks succeeded")
print(f"Snapshot: env={data.get('env')} node={data.get('node')} uptimeSec={data.get('uptimeSec')}")
PY

echo "PASS: production monitoring baseline is healthy"

if [[ "${run_stripe_check}" == "1" ]]; then
    echo "Running Stripe end-to-end check"
    email="monitor-$(date +%s)-$RANDOM@test.io"
    password="MonPass123"

    register_resp="$(curl -sS -X POST "${backend}/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"Monitor Bot\",\"email\":\"${email}\",\"password\":\"${password}\",\"role\":\"company\"}")"

    python3 - << 'PY' "${register_resp}"
import json
import sys

resp = json.loads(sys.argv[1])
msg = resp.get("message")
err = resp.get("error")

if msg == "Registered successfully":
        print("PASS: monitor user registered")
        sys.exit(0)

if err == "Email already exists":
        print("PASS: monitor user already existed")
        sys.exit(0)

print(f"FAIL: register response unexpected: {resp}")
sys.exit(1)
PY

    login_resp="$(curl -sS -X POST "${backend}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\",\"password\":\"${password}\"}")"

    token="$(python3 - << 'PY' "${login_resp}"
import json
import sys
resp = json.loads(sys.argv[1])
print(resp.get("token", ""))
PY
)"

    if [[ -z "${token}" ]]; then
        echo "FAIL: login did not return a token"
        exit 1
    fi
    echo "PASS: token acquired"

    checkout_resp="$(curl -sS -X POST "${backend}/api/payments/create-checkout-session" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d '{"planId":"level1"}')"

    python3 - << 'PY' "${checkout_resp}" "${stripe_check_mode}"
import json
import sys

resp = json.loads(sys.argv[1])
mode = sys.argv[2]
url = resp.get("url", "")
if not url:
        print(f"FAIL: checkout response missing url: {resp}")
        sys.exit(1)

if "checkout.stripe.com" not in url:
        print(f"FAIL: checkout url is invalid: {url}")
        sys.exit(1)

if mode == "live":
    if "cs_live_" not in url:
        print(f"FAIL: checkout session is not live: {url}")
        sys.exit(1)
elif mode == "test":
    if "cs_test_" not in url:
        print(f"FAIL: checkout session is not test: {url}")
        sys.exit(1)
elif mode == "any":
    if "cs_live_" not in url and "cs_test_" not in url:
        print(f"FAIL: checkout session id not recognized: {url}")
        sys.exit(1)
else:
    print(f"FAIL: invalid STRIPE_CHECK_MODE={mode} (expected live|test|any)")
    sys.exit(1)

print(f"PASS: Stripe {mode} checkout session created")
PY

    echo "PASS: Stripe end-to-end check succeeded"
else
    echo "Stripe end-to-end check skipped (RUN_STRIPE_CHECK=0)"
fi
