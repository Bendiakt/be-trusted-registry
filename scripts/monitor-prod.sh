#!/usr/bin/env bash
set -euo pipefail

backend="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
backend="${backend%/}"
max_ms="${MAX_HEALTH_MS:-1500}"
max_business_metrics_ms="${MAX_BUSINESS_METRICS_MS:-1000}"
run_stripe_check="${RUN_STRIPE_CHECK:-1}"
stripe_check_mode="${STRIPE_CHECK_MODE:-live}"
curl_max_time="${CURL_MAX_TIME:-15}"
curl_retry_count="${CURL_RETRY_COUNT:-2}"
monitor_insecure_tls="${MONITOR_INSECURE_TLS:-0}"

curl_opts=(
    --silent
    --show-error
    --max-time "${curl_max_time}"
    --retry "${curl_retry_count}"
    --retry-all-errors
    --retry-delay 1
)

if [[ "${monitor_insecure_tls}" == "1" ]]; then
    curl_opts+=(--insecure)
fi

echo "Monitoring target: ${backend}"
echo "Curl opts: max_time=${curl_max_time}s retries=${curl_retry_count} insecure_tls=${monitor_insecure_tls}"

health_with_time="$(curl "${curl_opts[@]}" -w "\n%{http_code} %{time_total}" "${backend}/api/health")"
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

echo "Checking readiness probe"
ready_http="$(curl "${curl_opts[@]}" -o /tmp/monitor_ready_body.txt -w "%{http_code}" "${backend}/api/health/ready")"
ready_body="$(cat /tmp/monitor_ready_body.txt)"
echo "Readiness HTTP: ${ready_http}  body: ${ready_body}"
if [[ "${ready_http}" != "200" ]]; then
  echo "FAIL: /api/health/ready returned ${ready_http} — DB may be unreachable"
  exit 1
fi
python3 - "${ready_body}" << 'PY'
import json, sys
data = json.loads(sys.argv[1])
if not data.get("ready"):
    print(f"FAIL: readiness probe ready=false — {data}")
    sys.exit(1)
if data.get("db") != "ok":
    print(f"FAIL: readiness probe db != ok — {data}")
    sys.exit(1)
print("PASS: readiness probe reports ready=true, db=ok")
PY

echo "Checking business metrics endpoint"
business_with_time="$(curl "${curl_opts[@]}" -w "\n%{http_code} %{time_total}" "${backend}/api/metrics/business")"
business_body="$(echo "${business_with_time}" | head -n 1)"
business_status_line="$(echo "${business_with_time}" | tail -n 1)"
business_http_code="$(echo "${business_status_line}" | awk '{print $1}')"
business_time_total="$(echo "${business_status_line}" | awk '{print $2}')"
business_latency_ms="$(python3 - "${business_time_total}" << 'PY'
import sys
print(int(float(sys.argv[1]) * 1000))
PY
)"

echo "Business metrics HTTP: ${business_http_code}"
echo "Business metrics latency: ${business_latency_ms}ms"

if [[ "${business_http_code}" != "200" ]]; then
  echo "FAIL: /api/metrics/business did not return HTTP 200"
  exit 1
fi

python3 - << 'PY' "${business_body}" "${max_business_metrics_ms}" "${business_latency_ms}"
import json
import sys

body = sys.argv[1]
max_ms = int(sys.argv[2])
latency_ms = int(sys.argv[3])

try:
    data = json.loads(body)
except Exception as exc:
    print(f"FAIL: business metrics payload is not valid JSON: {exc}")
    sys.exit(1)

if data.get("degraded") is not False:
    print(f"FAIL: business metrics degraded flag is {data.get('degraded')}")
    sys.exit(1)

if latency_ms > max_ms:
    print(f"FAIL: business metrics latency too high: {latency_ms}ms > {max_ms}ms")
    sys.exit(1)

print("PASS: business metrics degraded=false and latency threshold respected")
PY

if [[ "${run_stripe_check}" == "1" ]]; then
    echo "Running Stripe end-to-end check"
    email="monitor-$(date +%s)-$RANDOM@test.io"
    password="MonPass123"

    register_resp="$(curl "${curl_opts[@]}" -X POST "${backend}/api/auth/register" \
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

    login_resp="$(curl "${curl_opts[@]}" -X POST "${backend}/api/auth/login" \
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

    company_resp="$(curl "${curl_opts[@]}" -X POST "${backend}/api/companies/register" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d '{"name":"Monitor Co","industry":"services","country":"SN","description":"Monitoring profile"}')"

    python3 - << 'PY' "${company_resp}"
import json
import sys

resp = json.loads(sys.argv[1])
company = resp.get("company")
err = resp.get("error")

if company and company.get("id"):
    print("PASS: company profile ready")
    sys.exit(0)

print(f"FAIL: company profile response unexpected: {resp}")
sys.exit(1)
PY

    checkout_resp="$(curl "${curl_opts[@]}" -X POST "${backend}/api/payments/create-checkout-session" \
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
