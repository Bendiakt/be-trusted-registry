#!/usr/bin/env bash
set -euo pipefail

# Secure-by-default Railway CLI wrapper for this repository.
# Defaults are intentionally backend-oriented to avoid accidental deploys to Postgres.
DEFAULT_SERVICE="${RAILWAY_DEFAULT_SERVICE:-be-trusted-registry}"
DEFAULT_ENVIRONMENT="${RAILWAY_DEFAULT_ENVIRONMENT:-production}"

run_railway() {
  if [[ "${ALLOW_INSECURE_TLS_FALLBACK:-0}" == "1" ]]; then
    NODE_TLS_REJECT_UNAUTHORIZED=0 npx -y @railway/cli@latest "$@"
  else
    npx -y @railway/cli@latest "$@"
  fi
}

if [[ "$#" -eq 0 ]]; then
  run_railway
  exit 0
fi

cmd="$1"
shift

if [[ "$cmd" == "up" ]]; then
  has_service=0
  has_env=0
  for arg in "$@"; do
    [[ "$arg" == "-s" || "$arg" == "--service" ]] && has_service=1
    [[ "$arg" == "-e" || "$arg" == "--environment" ]] && has_env=1
  done

  args=("$@")
  (( has_service == 0 )) && args+=(--service "$DEFAULT_SERVICE")
  (( has_env == 0 )) && args+=(--environment "$DEFAULT_ENVIRONMENT")

  # Deploy only backend sources unless the caller explicitly provides a path.
  if [[ "${args[0]:-}" != "." && "${args[0]:-}" != "./backend" && "${args[0]:-}" != "backend" && "${args[0]:-}" != /* ]]; then
    run_railway up backend --path-as-root "${args[@]}"
  else
    run_railway up "${args[@]}"
  fi
  exit 0
fi

# Non-up commands still default to backend service/environment unless explicitly provided.
has_service=0
has_env=0
for arg in "$@"; do
  [[ "$arg" == "-s" || "$arg" == "--service" ]] && has_service=1
  [[ "$arg" == "-e" || "$arg" == "--environment" ]] && has_env=1
done

args=("$@")
(( has_service == 0 )) && args+=(--service "$DEFAULT_SERVICE")
(( has_env == 0 )) && args+=(--environment "$DEFAULT_ENVIRONMENT")

run_railway "$cmd" "${args[@]}"
