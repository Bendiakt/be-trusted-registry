#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.be-registry.db-audit"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
AUDIT_HOUR="${AUDIT_HOUR:-3}"
AUDIT_MINUTE="${AUDIT_MINUTE:-30}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
AUDIT_NOTIFY_SUCCESS="${AUDIT_NOTIFY_SUCCESS:-0}"

resolve_db_url() {
  if [[ -n "${DATABASE_PUBLIC_URL:-}" ]]; then
    printf '%s' "${DATABASE_PUBLIC_URL}"
    return 0
  fi
  if [[ -n "${DATABASE_URL:-}" && "${DATABASE_URL}" != *"railway.internal"* ]]; then
    printf '%s' "${DATABASE_URL}"
    return 0
  fi
  if command -v railway >/dev/null 2>&1; then
    NODE_TLS_REJECT_UNAUTHORIZED=0 railway variable list --service Postgres --json 2>/dev/null \
      | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const o=JSON.parse(s||'{}');process.stdout.write(o.DATABASE_PUBLIC_URL||'');});"
    return 0
  fi
  return 1
}

resolve_ntfy_topic() {
  if [[ -n "${NTFY_TOPIC:-}" ]]; then
    printf '%s' "${NTFY_TOPIC}"
    return 0
  fi
  local monitor_plist="${HOME}/Library/LaunchAgents/com.be-registry.monitor.plist"
  if [[ -f "${monitor_plist}" ]]; then
    awk '
      /<key>NTFY_TOPIC<\/key>/ {found=1; next}
      found && /<string>/ {
        gsub(/.*<string>/,"")
        gsub(/<\/string>.*/,"")
        print
        exit
      }
    ' "${monitor_plist}"
    return 0
  fi
  return 1
}

DATABASE_PUBLIC_URL="$(resolve_db_url || true)"
if [[ -z "${DATABASE_PUBLIC_URL}" ]]; then
  echo "FAIL: DATABASE_PUBLIC_URL not found"
  exit 1
fi
if [[ "${DATABASE_PUBLIC_URL}" == *"railway.internal"* ]]; then
  echo "FAIL: refusing railway.internal URL for local audit"
  exit 1
fi

NTFY_TOPIC_VALUE="$(resolve_ntfy_topic || true)"

mkdir -p "$(dirname "${PLIST_PATH}")"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT_DIR}/scripts/db-audit-and-alert.sh</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${AUDIT_HOUR}</integer>
    <key>Minute</key>
    <integer>${AUDIT_MINUTE}</integer>
  </dict>

  <key>RunAtLoad</key>
  <false/>

  <key>EnvironmentVariables</key>
  <dict>
    <key>DATABASE_PUBLIC_URL</key>
    <string>${DATABASE_PUBLIC_URL}</string>
    <key>NTFY_TOPIC</key>
    <string>${NTFY_TOPIC_VALUE}</string>
    <key>SLACK_WEBHOOK_URL</key>
    <string>${SLACK_WEBHOOK_URL}</string>
    <key>AUDIT_NOTIFY_SUCCESS</key>
    <string>${AUDIT_NOTIFY_SUCCESS}</string>
    <key>PATH</key>
    <string>/usr/local/opt/libpq/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>

  <key>StandardOutPath</key>
  <string>/tmp/be-registry-db-audit-launchagent.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/be-registry-db-audit-launchagent.err</string>
</dict>
</plist>
EOF

plutil -lint "${PLIST_PATH}" >/dev/null
launchctl unload "${PLIST_PATH}" 2>/dev/null || true
launchctl load "${PLIST_PATH}"

echo "PASS: LaunchAgent installed"
echo "plist=${PLIST_PATH}"
echo "schedule=${AUDIT_HOUR}:${AUDIT_MINUTE}"
echo "ntfy_topic=${NTFY_TOPIC_VALUE:-none}"
