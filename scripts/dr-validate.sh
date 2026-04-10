#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/4] monitor baseline"
bash "${ROOT_DIR}/scripts/monitor-prod.sh"

echo "[2/4] backup + restore audit cycle"
bash "${ROOT_DIR}/scripts/db-audit-cycle.sh"

echo "[3/4] failover logic dry-run simulation"
DRY_RUN=1 FORCE_UNHEALTHY=1 MAX_RETRIES=1 RETRY_DELAY_SEC=1 \
  bash "${ROOT_DIR}/scripts/auto-failover.sh" || true

echo "[4/4] runbook file checks"
for f in "${ROOT_DIR}/DR_RUNBOOK.md" "${ROOT_DIR}/DB_OPERATIONS.md" "${ROOT_DIR}/MIGRATION_STRATEGY.md"; do
  [[ -f "${f}" ]] || { echo "FAIL: missing $(basename "${f}")"; exit 1; }
done

echo "PASS: DR validation sequence completed"
