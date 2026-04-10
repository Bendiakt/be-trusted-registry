#!/usr/bin/env bash
set -euo pipefail

LABEL="com.be-registry.db-backup"
AGENT="gui/$(id -u)/${LABEL}"

launchctl kickstart -k "${AGENT}"

echo "Triggered ${AGENT}"
echo "Log: /tmp/be-registry-backup-launchagent.log"
