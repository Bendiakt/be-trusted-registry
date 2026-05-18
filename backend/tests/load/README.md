# Load Tests

Targets the three highest-traffic endpoints: registry search, supplier verify, and API key auth.

## Run

```bash
# Install autocannon globally (one-time)
npm install -g autocannon

# Against local dev server (make sure it's running on port 5000)
MYDD_API_KEY=mydd_lk_yourkey node tests/load/run.js

# Against staging
MYDD_BASE_URL=https://api-staging.mydd.work \
MYDD_API_KEY=mydd_lk_yourkey \
node tests/load/run.js

# Against production (use a dedicated load-test key with low rate limit)
MYDD_BASE_URL=https://api.mydd.work \
MYDD_API_KEY=mydd_lk_yourkey \
node tests/load/run.js
```

## What is tested

| Endpoint | Scenario |
|----------|---------|
| `GET /api/registry?limit=50` | Authenticated registry search (most common B2B call) |
| `GET /api/verify/1` | Public supplier verification (buyer-facing) |
| `GET /api/health` | Liveness probe (baseline, no DB) |

## Acceptance criteria

| Metric | Target |
|--------|--------|
| p99 latency — registry | < 500 ms |
| p99 latency — verify | < 300 ms |
| p99 latency — health | < 50 ms |
| Error rate | < 0.1 % |
| Throughput — registry | ≥ 100 req/s on a single Railway instance |
