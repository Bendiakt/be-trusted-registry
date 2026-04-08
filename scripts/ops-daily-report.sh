#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
RAILWAY_SERVICE="${RAILWAY_SERVICE:-be-trusted-registry}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

health_json="$(curl -sS "${BACKEND_URL%/}/api/health")"
metrics_json="$(curl -sS "${BACKEND_URL%/}/metrics/json")"

health_summary="$(python3 - <<'PY' "${health_json}"
import json, sys
h = json.loads(sys.argv[1])
print(f"status={h.get('status')} env={h.get('env')} uptimeSec={h.get('uptimeSec')} node={h.get('node')}")
PY
)"

err_count="$(${ROOT_DIR}/scripts/railway-cli.sh logs --service "${RAILWAY_SERVICE}" --environment "${RAILWAY_ENVIRONMENT}" --since 1d --filter "@level:error" 2>/dev/null | wc -l | tr -d ' ')"
warn_count="$(${ROOT_DIR}/scripts/railway-cli.sh logs --service "${RAILWAY_SERVICE}" --environment "${RAILWAY_ENVIRONMENT}" --since 1d --filter "@level:warn" 2>/dev/null | wc -l | tr -d ' ')"

metrics_summary="$(python3 - <<'PY' "${metrics_json}"
import json, sys
m = json.loads(sys.argv[1])
keys = sorted(m.keys())
print(f"metrics_keys={len(keys)} sample={','.join(keys[:5])}")
PY
)"

report="$(cat <<EOF
be-registry daily ops report ($(date -u +"%Y-%m-%dT%H:%M:%SZ"))
- ${health_summary}
- error_logs_24h=${err_count}
- warn_logs_24h=${warn_count}
- ${metrics_summary}
EOF
)"

echo "${report}"

if [[ -n "${SLACK_WEBHOOK_URL}" ]]; then
  curl -sS -X POST "${SLACK_WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"${report//$'\n'/\\n}\"}" >/dev/null || true
fi
