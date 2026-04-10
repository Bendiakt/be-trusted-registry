#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.be-registry.monitor"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
MONITOR_INTERVAL_SECONDS="${MONITOR_INTERVAL_SECONDS:-300}"
BACKEND_URL="${BACKEND_URL:-https://be-trusted-registry-production.up.railway.app}"
RUN_STRIPE_CHECK="${RUN_STRIPE_CHECK:-0}"
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
NTFY_TOPIC="${NTFY_TOPIC:-be-registry-prod-132fa515aadc}"

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
    <string>${ROOT_DIR}/scripts/monitor-and-alert.sh</string>
  </array>

  <key>StartInterval</key>
  <integer>${MONITOR_INTERVAL_SECONDS}</integer>

  <key>EnvironmentVariables</key>
  <dict>
    <key>BACKEND_URL</key>
    <string>${BACKEND_URL}</string>
    <key>RUN_STRIPE_CHECK</key>
    <string>${RUN_STRIPE_CHECK}</string>
    <key>ALERT_EMAIL_TO</key>
    <string>${ALERT_EMAIL_TO}</string>
    <key>SLACK_WEBHOOK_URL</key>
    <string>${SLACK_WEBHOOK_URL}</string>
    <key>NTFY_TOPIC</key>
    <string>${NTFY_TOPIC}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>

  <key>StandardOutPath</key>
  <string>/tmp/be-registry-monitor-launchagent.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/be-registry-monitor-launchagent.err</string>

  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF

plutil -lint "${PLIST_PATH}" >/dev/null
launchctl unload "${PLIST_PATH}" 2>/dev/null || true
launchctl load "${PLIST_PATH}"

echo "PASS: Monitor LaunchAgent installed"
echo "plist=${PLIST_PATH}"
echo "interval_seconds=${MONITOR_INTERVAL_SECONDS}"
echo "ntfy_topic=${NTFY_TOPIC}"
if [[ -n "${SLACK_WEBHOOK_URL}" ]]; then
  echo "slack=enabled"
else
  echo "slack=disabled"
fi
