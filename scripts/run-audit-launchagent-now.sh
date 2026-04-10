#!/usr/bin/env bash
set -euo pipefail

LABEL="com.be-registry.db-audit"
AGENT="gui/$(id -u)/${LABEL}"

launchctl kickstart -k "${AGENT}"

echo "Triggered ${AGENT}"
echo "Logs: /tmp/be-registry-db-audit-launchagent.log and /tmp/be-registry-db-audit-launchagent.err"
