#!/usr/bin/env bash
set -euo pipefail

backend="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
backend="${backend%/}"
max_ms="${MAX_HEALTH_MS:-1500}"

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
