#!/usr/bin/env bash
set -euo pipefail

# Secure-by-default Railway CLI wrapper.
# Set ALLOW_INSECURE_TLS_FALLBACK=1 only as a temporary workaround.
if [[ "${ALLOW_INSECURE_TLS_FALLBACK:-0}" == "1" ]]; then
  NODE_TLS_REJECT_UNAUTHORIZED=0 npx -y @railway/cli@latest "$@"
else
  npx -y @railway/cli@latest "$@"
fi
