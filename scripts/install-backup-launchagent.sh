#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.be-registry.db-backup"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
BACKUP_HOUR="${BACKUP_HOUR:-3}"
BACKUP_MINUTE="${BACKUP_MINUTE:-0}"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

# Prefer explicit DATABASE_PUBLIC_URL, then DATABASE_URL, then Railway service variable.
DATABASE_URL="${DATABASE_PUBLIC_URL:-${DATABASE_URL:-}}"
if [[ -z "${DATABASE_URL}" ]] && command -v railway >/dev/null 2>&1; then
  DATABASE_URL="$(NODE_TLS_REJECT_UNAUTHORIZED=0 railway variable list --service Postgres --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const o=JSON.parse(s||'{}');process.stdout.write(o.DATABASE_PUBLIC_URL||'');});")"
fi

if [[ -z "${DATABASE_URL}" ]]; then
  echo "FAIL: DATABASE_PUBLIC_URL/DATABASE_URL not found"
  echo "Hint: export DATABASE_PUBLIC_URL=postgresql://... and rerun"
  exit 1
fi

if [[ "${DATABASE_URL}" == *"railway.internal"* ]]; then
  echo "FAIL: refusing railway.internal URL for local LaunchAgent backup"
  echo "Use DATABASE_PUBLIC_URL (proxy URL)"
  exit 1
fi

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
    <string>${ROOT_DIR}/scripts/db-backup.sh</string>
  </array>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${BACKUP_HOUR}</integer>
    <key>Minute</key>
    <integer>${BACKUP_MINUTE}</integer>
  </dict>

  <key>RunAtLoad</key>
  <false/>

  <key>EnvironmentVariables</key>
  <dict>
    <key>DATABASE_URL</key>
    <string>${DATABASE_URL}</string>
    <key>KEEP_BACKUPS</key>
    <string>${KEEP_BACKUPS}</string>
    <key>BACKUP_DIR</key>
    <string>${BACKUP_DIR}</string>
    <key>PATH</key>
    <string>/usr/local/opt/libpq/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>

  <key>StandardOutPath</key>
  <string>/tmp/be-registry-backup-launchagent.log</string>

  <key>StandardErrorPath</key>
  <string>/tmp/be-registry-backup-launchagent.err</string>
</dict>
</plist>
EOF

plutil -lint "${PLIST_PATH}" >/dev/null
launchctl unload "${PLIST_PATH}" 2>/dev/null || true
launchctl load "${PLIST_PATH}"

echo "PASS: LaunchAgent installed"
echo "plist=${PLIST_PATH}"
echo "schedule=${BACKUP_HOUR}:${BACKUP_MINUTE}"
echo "keep_backups=${KEEP_BACKUPS}"
echo "backup_dir=${BACKUP_DIR}"
