# Production Runbook — BE-TRUSTED-REGISTRY

**Service**: `be-trusted-registry`
**Environment**: Production on Railway
**URL**: https://be-trusted-registry-production.up.railway.app
**Runtime**: Node.js ≥ 22.12.0 · PostgreSQL (Railway managed)
**Owner**: B&E Consult FZCO
**Last Updated**: 2026-04-08

> This is the single source of truth for production operations. It covers health checks, monitoring, database operations, failover, alerting, CI/CD, and troubleshooting. No developer assistance should be required for any procedure documented here.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Monitoring](#2-monitoring)
3. [Security](#3-security)
4. [Database Operations](#4-database-operations)
5. [Failover & Recovery](#5-failover--recovery)
6. [Monitoring Stack (Prometheus + Grafana)](#6-monitoring-stack-prometheus--grafana)
7. [Alerting](#7-alerting)
8. [CI/CD](#8-cicd)
9. [Logs](#9-logs)
10. [Troubleshooting](#10-troubleshooting)
11. [Support](#11-support)
12. [Maintenance Schedule](#12-maintenance-schedule)
13. [Pre-Production Checklist](#13-pre-production-checklist)

---

## 1. Quick Start

The fastest way to confirm the service is healthy.

### Health check

```bash
curl -s https://be-trusted-registry-production.up.railway.app/api/health | jq .
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-04-08T10:00:00.000Z",
  "uptimeSec": 3600,
  "memory": { "rss": 52428800, "heapUsed": 18874368, "heapTotal": 33554432 },
  "node": "v22.12.0",
  "env": "production"
}
```

Any response other than `"status": "ok"` is an incident. Proceed to [Section 5 — Failover & Recovery](#5-failover--recovery).

### Prometheus metrics

```bash
curl -s https://be-trusted-registry-production.up.railway.app/metrics
```

### JSON metrics (dashboard-friendly)

```bash
curl -s https://be-trusted-registry-production.up.railway.app/metrics/json | jq .
```

### Business metrics

```bash
curl -s https://be-trusted-registry-production.up.railway.app/api/metrics/business | jq .
```

### Full production monitoring baseline (health + Stripe end-to-end)

```bash
npm run monitor:prod
```

### Real-time WebSocket metrics feed

Connect to `wss://be-trusted-registry-production.up.railway.app/ws/metrics` — the server pushes a `{ type: "metrics", data: { ... } }` frame every 10 seconds with live business KPIs.

---

## 2. Monitoring

### 2.1 REST endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | None | Service liveness, uptime, memory, Node version |
| `GET /metrics` | None | Prometheus text format (scrape target) |
| `GET /metrics/json` | None | JSON metrics snapshot |
| `GET /api/metrics/business` | None | Live business KPIs from DB |
| `POST /api/metrics/snapshot` | `x-metrics-secret` header | Persist a metrics snapshot to DB |
| `GET /api/metrics/trust/:userId` | JWT Bearer | Compute trust score for a user |

### 2.2 Business metrics payload

`GET /api/metrics/business` returns:

```json
{
  "timestamp": "2026-04-08T10:00:00.000Z",
  "users_total": 142,
  "companies_total": 98,
  "certified_total": 31,
  "cert_rate_pct": 32,
  "fraud_alerts_active": 2,
  "avg_trust_score": 67.4,
  "revenue_total_usd": 48510,
  "prev_snapshot": { ... }
}
```

### 2.3 Prometheus metrics exposed

| Metric | Type | Description |
|---|---|---|
| `process_uptime_seconds` | gauge | Total process uptime |
| `http_requests_total` | counter | All HTTP requests received |
| `http_errors_total` | counter | Responses with status ≥ 400 |
| `http_request_latency_avg_ms` | gauge | Rolling average latency (ms) |
| `http_error_rate_percent` | gauge | Error rate as a percentage |
| `process_resident_memory_bytes` | gauge | RSS memory usage |
| `process_heap_used_bytes` | gauge | Heap in use |
| `process_heap_total_bytes` | gauge | Total heap allocated |

### 2.4 WebSocket real-time feed

The server broadcasts business metrics to all connected WebSocket clients every 10 seconds on path `/ws/metrics`. The payload mirrors the `/api/metrics/business` response plus `requests_total`.

Quick test with `wscat`:

```bash
npx wscat -c wss://be-trusted-registry-production.up.railway.app/ws/metrics
```

### 2.5 Automated health monitoring (LaunchAgent)

The monitor LaunchAgent (`com.be-registry.monitor`) runs `scripts/monitor-and-alert.sh` every 5 minutes. It checks health, validates the response payload, measures latency, and fires alerts on failure.

**Install / reinstall:**

```bash
npm run monitor:launchagent:install
```

**Trigger immediately (without waiting for the interval):**

```bash
npm run monitor:launchagent:run
```

**Check LaunchAgent status:**

```bash
launchctl list | grep com.be-registry.monitor
```

**View live monitor log:**

```bash
tail -f /tmp/be-registry-monitor-launchagent.log
```

---

## 3. Security

### 3.1 Encryption — AES-256-GCM PII protection

PII fields are encrypted at rest using AES-256-GCM (`backend/lib/encryption.js`). The key is a 64-character hex string (32 bytes) stored in the `ENCRYPTION_KEY` environment variable.

- **Encrypt**: `encrypt(plaintext)` → `ivHex.ctHex.tagHex`
- **Decrypt**: `decrypt(ciphertext)` → plaintext
- **Tokenize**: `tokenize(pii)` → `{ token, encrypted }` — deterministic HMAC token safe for lookups
- **Integrity hash**: `hashForIntegrity(data)` → SHA-256 hex — used in `audit_log.payload_hash`

**Rotate the encryption key:**

1. Generate a new 32-byte key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update `ENCRYPTION_KEY` in Railway environment variables.
3. Redeploy the backend service.
4. Re-encrypt any existing PII fields that were encrypted with the old key (coordinate with engineering).

### 3.2 Authentication — JWT

- Algorithm: HS256
- Expiry: 7 days
- Secret: `JWT_SECRET` environment variable (required — server refuses to start without it)
- All protected routes require `Authorization: Bearer <token>`

**Rotate JWT_SECRET:**

1. Generate a new secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. Update `JWT_SECRET` in Railway environment variables.
3. Redeploy. All existing tokens are immediately invalidated — users must log in again.

**Test auth flow:**

```bash
# Register
curl -s -X POST https://be-trusted-registry-production.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"SecurePass123","role":"company"}' | jq .

# Login and capture token
TOKEN=$(curl -s -X POST https://be-trusted-registry-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123"}' | jq -r .token)

# Access protected route
curl -s -H "Authorization: Bearer $TOKEN" \
  https://be-trusted-registry-production.up.railway.app/api/companies/me | jq .
```

### 3.3 Stripe LIVE payments

The service processes real payments via Stripe. Two environment variables are required:

| Variable | Format | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | Stripe live secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Webhook signing secret |

**Certification plans:**

| Plan ID | Name | Price |
|---|---|---|
| `level1` | Document Verification | $490 |
| `level2` | KYC Full Validation | $990 |
| `level3` | Physical Site Inspection | $2,490 |

**Validate Stripe live configuration:**

```bash
npm run stripe:validate:live
```

**Validate in test mode:**

```bash
npm run stripe:validate:test
```

**Webhook endpoint**: `POST /api/payments/webhook`
- Rejects requests without a valid `stripe-signature` header (returns HTTP 400)
- On `checkout.session.completed`: upgrades company `certification_level` in DB and runs fraud checks

**Update Stripe keys via Railway CLI:**

```bash
scripts/railway-cli.sh variable set STRIPE_SECRET_KEY sk_live_YOUR_KEY_HERE
scripts/railway-cli.sh variable set STRIPE_WEBHOOK_SECRET whsec_YOUR_SECRET_HERE
scripts/railway-cli.sh redeploy --service be-trusted-registry --yes
```

**Rollback to test keys:**

```bash
scripts/railway-cli.sh variable set STRIPE_SECRET_KEY sk_test_YOUR_OLD_KEY
scripts/railway-cli.sh redeploy --service be-trusted-registry --yes
```

### 3.4 Fraud detection

Seven rules run automatically on registration, login, company profile updates, and Stripe webhooks:

| Rule | Severity | Trigger |
|---|---|---|
| `disposable_email` | medium | Disposable email domain (mailinator, etc.) |
| `no_company_profile` | low | Checkout attempted without a company profile |
| `rapid_profile_change` | medium | > 3 company profile updates in 24 hours |
| `ip_multi_account` | high | Single IP linked to > 3 accounts in 24 hours |
| `brute_force_login` | high | > 5 failed login attempts in 15 minutes |
| `stripe_radar_risk` | medium/high | Stripe Radar elevated or highest risk signal |
| `stripe_charge_disputed` | high | Stripe charge disputed (chargeback) |

Triggered alerts are persisted to the `fraud_alerts` table. Active (unresolved) alert count is visible in `/api/metrics/business` as `fraud_alerts_active`.

**Resolve a fraud alert manually:**

```bash
# Connect to the DB and mark alert as resolved
psql "$DATABASE_URL" -c "UPDATE fraud_alerts SET resolved = TRUE WHERE id = <alert_id>;"
```

### 3.5 Trust score engine

Trust scores (0–100) are computed from 27 weighted indicators across five categories: profile completeness, certification level, payment record, fraud signals, and account age/activity. Scores are persisted to `trust_scores`.

| Score range | Risk level |
|---|---|
| 70–100 | low |
| 40–69 | medium |
| 0–39 | high |

**Compute trust score for a user:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://be-trusted-registry-production.up.railway.app/api/metrics/trust/42 | jq .
```

### 3.6 Audit log

Every significant action (register, login, company update, checkout) writes an immutable row to `audit_log` with a SHA-256 hash of the payload. The log is fire-and-forget and never blocks a response.

**Query recent audit events:**

```bash
psql "$DATABASE_URL" -c \
  "SELECT created_at, action, resource, ip_address FROM audit_log ORDER BY created_at DESC LIMIT 20;"
```

---

## 4. Database Operations

### 4.1 Prerequisites

PostgreSQL client tools must be installed locally for backup and restore operations:

```bash
# macOS
brew install libpq
brew link --force libpq

# Verify
pg_dump --version
pg_restore --version
```

The `DATABASE_URL` must point to the **public** Railway PostgreSQL endpoint (not `postgres.railway.internal`, which is only reachable inside the Railway private network).

```bash
# Export the public URL before running any DB operation
export DATABASE_URL="postgresql://postgres:<password>@<host>.railway.app:<port>/railway"
# or
export DATABASE_PUBLIC_URL="postgresql://postgres:<password>@<host>.railway.app:<port>/railway"
```

### 4.2 Smoke test (connectivity + row counts)

Run before and after any schema change or restore:

```bash
npm run db:smoke
```

### 4.3 Backup

Creates a custom-format `pg_dump` under `backups/` with a UTC timestamp. Keeps the 7 most recent dumps (configurable via `KEEP_BACKUPS`).

```bash
npm run db:backup
```

Custom output directory:

```bash
BACKUP_DIR=/tmp/db-backups npm run db:backup
```

The script prints the file path, size, and SHA-256 checksum on success:

```
PASS: backup created
file=backups/be-registry-20260408T030000Z.dump
size=2.4M
SHA256: a3f1...
```

### 4.4 Restore dry-run (non-destructive validation)

Restores the latest dump into a temporary database, verifies row counts, then drops the temp database. Safe to run at any time — does not touch production data.

```bash
npm run db:restore:dry-run
```

Restore a specific dump:

```bash
bash scripts/db-restore-dry-run.sh backups/be-registry-20260408T030000Z.dump
```

Keep the temp database for manual inspection:

```bash
KEEP_TMP_DB=1 bash scripts/db-restore-dry-run.sh backups/be-registry-20260408T030000Z.dump
```

### 4.5 Restore to production (destructive)

> **WARNING**: This overwrites the target database. Always take a fresh backup first and get sign-off before proceeding.

```bash
# Step 1: Take a fresh backup
npm run db:backup

# Step 2: Restore (will prompt for confirmation unless FORCE=1)
FORCE=1 bash scripts/db-restore.sh backups/be-registry-20260408T030000Z.dump

# Step 3: Verify
npm run db:smoke
npm run monitor:prod
```

Restore to a specific database URL (e.g. a staging environment):

```bash
DATABASE_URL='postgresql://...' FORCE=1 bash scripts/db-restore.sh backups/be-registry-20260408T030000Z.dump
```

### 4.6 Full audit cycle (backup + dry-run restore)

Runs backup, then immediately validates the dump via a dry-run restore. Used by the daily LaunchAgent at 03:30 AM.

```bash
npm run db:audit:cycle
```

### 4.7 Database migrations

Migrations are plain SQL files in `migrations/` and `backend/migrations/`. They are additive by default (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX CONCURRENTLY`).

**Apply a migration:**

```bash
# Locally (requires public DATABASE_URL)
psql "$DATABASE_URL" -f migrations/001_add_users_last_login.sql

# Inside Railway network via CLI
scripts/railway-cli.sh run --service be-trusted-registry \
  node -e "
    const { query, initDb } = require('./backend/db');
    const fs = require('fs');
    const sql = fs.readFileSync('migrations/001_add_users_last_login.sql', 'utf8');
    query(sql).then(() => { console.log('PASS'); process.exit(0); }).catch(e => { console.error('FAIL', e.message); process.exit(1); });
  "
```

**Pre-migration checklist:**

```
[ ] Take a manual backup:       npm run db:backup
[ ] Verify backup checksum:     shasum -a 256 backups/LATEST.dump
[ ] Check table counts:         npm run db:smoke
[ ] Confirm app is healthy:     npm run monitor:prod
[ ] Have rollback SQL ready before applying the forward migration
```

**Rollback an additive column:**

```sql
ALTER TABLE users DROP COLUMN IF EXISTS last_login;
```

**Emergency full rollback:**

```bash
# 1. Restore from most recent backup
FORCE=1 bash scripts/db-restore.sh "$(ls -1t backups/*.dump | head -1)"

# 2. Rollback Railway deployment to previous commit
scripts/railway-cli.sh redeploy --service be-trusted-registry --yes
```

### 4.8 Backup LaunchAgent automation

The backup LaunchAgent (`com.be-registry.db-backup`) runs `scripts/db-backup.sh` daily at 03:00 AM, keeping the 7 most recent dumps.

**Install:**

```bash
npm run db:backup:launchagent:install
```

**Trigger immediately:**

```bash
npm run db:backup:launchagent:run
```

**Check status:**

```bash
launchctl list | grep com.be-registry.db-backup
```

**View backup log:**

```bash
tail -f /tmp/be-registry-backup-launchagent.log
```

### 4.9 Audit LaunchAgent automation

The audit LaunchAgent (`com.be-registry.db-audit`) runs `scripts/db-audit-and-alert.sh` daily at 03:30 AM. It executes the full audit cycle and fires alerts on failure.

**Install:**

```bash
npm run db:audit:launchagent:install
```

**Trigger immediately:**

```bash
npm run db:audit:launchagent:run
```

**Check status:**

```bash
launchctl list | grep com.be-registry.db-audit
```

**View audit log:**

```bash
tail -f /tmp/be-registry-db-audit-launchagent.log
```

---

## 5. Failover & Recovery

### 5.1 Automated failover

`scripts/auto-failover.sh` checks service health, attempts a Railway restart, and if that fails, triggers a full redeploy. Sends alerts via ntfy.sh and/or Slack on recovery or critical failure.

```bash
npm run failover:auto
```

**Dry-run simulation (no real Railway actions):**

```bash
npm run failover:test
```

**Failover logic:**

1. Check `GET /api/health` — if healthy, exit 0.
2. If unhealthy: trigger `railway restart --service be-trusted-registry`.
3. Retry health check up to 3 times (10-second intervals).
4. If still unhealthy: trigger `railway redeploy --service be-trusted-registry --yes`.
5. Retry health check up to 3 more times.
6. If still unhealthy: fire CRITICAL alert and exit 1.

### 5.2 Manual restart via Railway CLI

```bash
scripts/railway-cli.sh restart --service be-trusted-registry
```

### 5.3 Manual redeploy via Railway CLI

```bash
scripts/railway-cli.sh redeploy --service be-trusted-registry --yes
```

### 5.4 Rollback to a previous deployment

Via Railway Dashboard:
1. Open the Railway project.
2. Select the `be-trusted-registry` service.
3. Click **Deployments** in the left sidebar.
4. Find the last known-good deployment and click **Rollback**.

Via CLI (pin a specific git commit):

```bash
git checkout <previous-commit-sha> -- backend/
git push origin main   # triggers Railway auto-deploy
```

### 5.5 Full disaster recovery sequence

Follow the steps in `DR_RUNBOOK.md` for a complete incident response. Summary:

```bash
# T+0: Confirm scope
npm run monitor:prod
npm run db:smoke
npm run db:audit:cycle

# T+5: Attempt automated failover
npm run failover:auto

# T+10: If unresolved, take a backup before invasive recovery
npm run db:backup

# T+15: Validate latest backup
npm run db:restore:dry-run

# T+20: Controlled production restore (only after sign-off)
DATABASE_URL='postgresql://...public...' FORCE=1 bash scripts/db-restore.sh backups/<dump>.dump
```

### 5.6 DR validation (full sequence dry-run)

Runs monitor baseline, backup + restore audit cycle, failover dry-run, and runbook file checks:

```bash
npm run dr:validate
```

### 5.7 Post-recovery verification checklist

```
[ ] Backend health stable for 15 minutes (npm run monitor:prod)
[ ] Auth flow works (register + login)
[ ] Stripe checkout session creation returns a valid URL
[ ] Metrics endpoint returns valid payload
[ ] LaunchAgents still loaded:
    launchctl list | grep com.be-registry
[ ] No active fraud alerts spike in /api/metrics/business
```

---

## 6. Monitoring Stack (Prometheus + Grafana)

The local monitoring stack runs Prometheus (scrapes `/metrics` every 15 seconds) and Grafana (pre-provisioned dashboard) via Docker Compose.

### 6.1 Start the stack

```bash
npm run monitoring:stack:up
```

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (default credentials: `admin` / `admin`)

The Grafana dashboard `be-registry-overview` is auto-provisioned from `monitoring/grafana/dashboards/be-registry-overview.json`.

### 6.2 Stop the stack

```bash
npm run monitoring:stack:down
```

### 6.3 Prometheus scrape targets

Defined in `monitoring/prometheus.yml`:

| Job | Path | Target |
|---|---|---|
| `be_registry_backend_metrics` | `/metrics` | `be-trusted-registry-production.up.railway.app` |
| `be_registry_backend_health_probe` | `/api/health` | `be-trusted-registry-production.up.railway.app` |

Scrape interval: 15 seconds.

### 6.4 Verify Prometheus is scraping

1. Open http://localhost:9090/targets
2. Both targets should show **UP** state.
3. Query `http_requests_total` in the Prometheus expression browser to confirm data is flowing.

---

## 7. Alerting

### 7.1 ntfy.sh push alerts (zero-setup)

ntfy.sh delivers push notifications to any device with the ntfy app installed. No account required.

**Default topic**: `be-registry-prod-132fa515aadc`

Subscribe on your device:
1. Install the ntfy app (iOS / Android / desktop).
2. Subscribe to topic: `be-registry-prod-132fa515aadc`
3. Or open: https://ntfy.sh/be-registry-prod-132fa515aadc

**Send a test alert manually:**

```bash
curl -X POST https://ntfy.sh/be-registry-prod-132fa515aadc \
  -H "Title: be-registry test alert" \
  -H "Priority: urgent" \
  -H "Tags: rotating_light,production" \
  -d "Manual test alert from ops runbook"
```

**Use a custom topic** (recommended for production — keep it secret):

```bash
NTFY_TOPIC=your-secret-topic npm run monitor:launchagent:install
```

### 7.2 Slack integration

**Activate Slack alerting** (validates the webhook, then installs both monitor and audit LaunchAgents with Slack enabled):

```bash
SLACK_WEBHOOK_URL='https://hooks.slack.com/services/T.../B.../...' \
  npm run alerts:slack:activate
```

Or using the script directly:

```bash
bash scripts/activate-slack-alerting.sh 'https://hooks.slack.com/services/T.../B.../...'
```

The script:
1. Validates the webhook URL format.
2. Sends a test message to confirm delivery.
3. Reinstalls the monitor LaunchAgent with `SLACK_WEBHOOK_URL` set.
4. Reinstalls the audit LaunchAgent with `SLACK_WEBHOOK_URL` set.

**Verify Slack is configured:**

```bash
launchctl list | grep com.be-registry
# Both com.be-registry.monitor and com.be-registry.db-audit should appear
```

### 7.3 Alert channels summary

| Channel | Trigger | Configured by |
|---|---|---|
| ntfy.sh push | Health check failure, DB audit failure, failover events | `NTFY_TOPIC` env var |
| Slack | Health check failure, DB audit failure | `SLACK_WEBHOOK_URL` env var |
| Email | Health check failure | `ALERT_EMAIL_TO` env var |

### 7.4 Daily ops report (Slack)

Sends a daily summary of health status, error/warn log counts, and metrics keys to Slack:

```bash
SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...' npm run ops:daily-report
```

---

## 8. CI/CD

### 8.1 CI workflow (`ci.yml`)

Triggers on every push and pull request to `main`.

**Jobs:**

| Job | What it does |
|---|---|
| `Backend lint & health check` | Installs deps, checks JS syntax on all backend files, verifies `.env.example` documents required vars |
| `Production health check` | On push to `main` only: hits `/api/health` and `/api/auth/login` on the live production URL |

**Required GitHub secrets**: none for the lint job. The production health check job runs only on push to `main` (not on fork PRs).

### 8.2 Preprod Gate workflow (`preprod-gate.yml`)

Triggers on push/PR to `main` for changes under `backend/`. Requires `PREPROD_DATABASE_URL` and `PREPROD_JWT_SECRET` GitHub secrets.

**What it does:**
1. Detects whether preprod secrets are available (skips gracefully if not).
2. Installs backend dependencies.
3. Runs `npm run migrate` against the preprod database.
4. Starts the backend with `npm run start:preprod` (migrate + boot).
5. Polls `GET /api/health` for up to 30 seconds.
6. Asserts `status == "ok"` — fails the gate if not.

**Trigger manually:**

```bash
# Via GitHub UI: Actions → Preprod Gate → Run workflow
# Or via GitHub CLI:
gh workflow run preprod-gate.yml -f reason="manual verification before release"
```

### 8.3 Preprod Migrate workflow (`preprod-migrate.yml`)

Identical gate to `preprod-gate.yml` but named separately for clarity when triggered as a standalone migration check. Useful before applying a schema change to production.

**Trigger manually:**

```bash
gh workflow run preprod-migrate.yml -f reason="pre-migration boot check"
```

### 8.4 Required GitHub secrets

| Secret | Used by | Description |
|---|---|---|
| `PREPROD_DATABASE_URL` | preprod-gate, preprod-migrate | PostgreSQL URL for preprod environment |
| `PREPROD_JWT_SECRET` | preprod-gate, preprod-migrate | JWT secret for preprod environment |

### 8.5 Railway auto-deploy

Railway is configured to auto-deploy on push to `main`. The `railway.toml` defines:

- **Build**: Nixpacks — builds frontend (`npm install && npm run build`) then installs backend deps
- **Start**: `cd backend && node server.js`
- **Health check path**: `/api/health` (timeout: 300 seconds)
- **Restart policy**: `ON_FAILURE`, max 10 retries
- **Node version**: 22.12.0

---

## 9. Logs

### 9.1 Railway service logs (live)

```bash
scripts/railway-cli.sh logs --service be-trusted-registry
```

Follow mode:

```bash
scripts/railway-cli.sh logs --service be-trusted-registry --follow
```

Filter errors only:

```bash
scripts/railway-cli.sh logs --service be-trusted-registry --filter "@level:error"
```

### 9.2 Application log format

Every request is logged as structured JSON:

```json
{
  "ts": "2026-04-08T10:00:00.000Z",
  "method": "POST",
  "path": "/api/auth/login",
  "status": 200,
  "durationMs": 142
}
```

Stripe webhook events log additional structured fields:

```json
{ "event": "stripe.webhook.received", "stripeEventId": "evt_...", "stripeEventType": "checkout.session.completed" }
{ "event": "stripe.payment.confirmed", "sessionId": "cs_live_...", "planId": "level1", "companyId": "42", "amountTotal": 49000 }
{ "event": "company.certification.upgraded", "companyId": "42", "certificationLevel": 1 }
```

### 9.3 Health check monitor log

Written by the LaunchAgent every 5 minutes:

```bash
tail -f /tmp/be-registry-monitor-launchagent.log
# or
tail -f /tmp/be-registry-monitor.log
```

### 9.4 DB audit log

Written by the audit LaunchAgent daily at 03:30 AM:

```bash
tail -f /tmp/be-registry-db-audit-launchagent.log
# or
tail -f /tmp/be-registry-db-audit.log
```

### 9.5 DB backup log

Written by the backup LaunchAgent daily at 03:00 AM:

```bash
tail -f /tmp/be-registry-backup-launchagent.log
```

### 9.6 LaunchAgent error logs

Each LaunchAgent writes stderr to a separate `.err` file:

```bash
cat /tmp/be-registry-monitor-launchagent.err
cat /tmp/be-registry-backup-launchagent.err
cat /tmp/be-registry-db-audit-launchagent.err
```

---

## 10. Troubleshooting

### Service returns non-200 on `/api/health`

1. Check Railway deployment status: Railway Dashboard → `be-trusted-registry` → Deployments.
2. Check recent logs for startup errors: `scripts/railway-cli.sh logs --service be-trusted-registry`.
3. Run automated failover: `npm run failover:auto`.
4. If failover fails, rollback to the previous deployment via Railway Dashboard.

### Service starts but crashes immediately

Most likely cause: a missing required environment variable. The server throws on startup if `JWT_SECRET` is absent.

```bash
# Check logs for the error
scripts/railway-cli.sh logs --service be-trusted-registry | grep -i "error\|missing\|fail"
```

Verify all required variables are set in Railway:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Injected automatically by Railway PostgreSQL |
| `JWT_SECRET` | Yes | Server refuses to start without it |
| `STRIPE_SECRET_KEY` | Yes | Must be `sk_live_...` in production |
| `STRIPE_WEBHOOK_SECRET` | Yes | Must be `whsec_...` |
| `FRONTEND_URL` | Yes | Used for Stripe redirect URLs and CORS |
| `ENCRYPTION_KEY` | Yes (if PII encryption used) | 64 hex chars |
| `METRICS_SECRET` | Optional | Required only for `POST /api/metrics/snapshot` |
| `CORS_ORIGINS` | Optional | Comma-separated list; falls back to `FRONTEND_URL` |

### Database connection errors

```
Error: Missing DATABASE_URL. Configure PostgreSQL before starting the backend.
```

- Verify the PostgreSQL service is running in Railway.
- Confirm `DATABASE_URL` is injected into the backend service (Railway Dashboard → Variables).
- If using a public URL locally, ensure public networking is enabled on the Railway PostgreSQL service.

```bash
# Test connectivity
psql "$DATABASE_URL" -c "SELECT 1;"
```

### Stripe payments failing

**`StripeAuthenticationError`**: `STRIPE_SECRET_KEY` is invalid or in test mode. Update to `sk_live_...`.

**`StripeConnectionError` / `ETIMEDOUT`**: Stripe API is temporarily unreachable. The service returns HTTP 503 — client should retry.

**Webhook returns HTTP 400**: Signature verification failed. Confirm `STRIPE_WEBHOOK_SECRET` matches the signing secret in Stripe Dashboard → Webhooks → your endpoint.

**Checkout session returns test URL (`cs_test_...`) instead of live (`cs_live_...`)**:

```bash
# Confirm the key in use is live
scripts/railway-cli.sh variable list --service be-trusted-registry | grep STRIPE_SECRET_KEY
```

### CORS errors in browser

The backend allows origins from `CORS_ORIGINS` (comma-separated) or `FRONTEND_URL`. If the frontend URL changed:

1. Update `FRONTEND_URL` (or `CORS_ORIGINS`) in Railway environment variables.
2. Redeploy the backend.

### High error rate in metrics

```bash
# Check current error rate
curl -s https://be-trusted-registry-production.up.railway.app/metrics/json | jq .error_rate_percent

# Check recent errors in logs
scripts/railway-cli.sh logs --service be-trusted-registry --filter "@level:error" --since 1h
```

### Backup fails with `railway.internal` error

The backup script refuses to run against the internal Railway hostname. Enable public networking on the PostgreSQL service:

Railway Dashboard → PostgreSQL service → Settings → Networking → **Enable Public Networking**

Then export the public URL:

```bash
export DATABASE_PUBLIC_URL="postgresql://postgres:<password>@<host>.railway.app:<port>/railway"
npm run db:backup
```

### LaunchAgent not running

```bash
# Check if loaded
launchctl list | grep com.be-registry

# Reload
launchctl unload ~/Library/LaunchAgents/com.be-registry.monitor.plist
launchctl load ~/Library/LaunchAgents/com.be-registry.monitor.plist

# Reinstall from scratch
npm run monitor:launchagent:install
```

### Trust score returns 0 for all indicators

The trust score engine requires the `trust_scores`, `fraud_alerts`, and `audit_log` tables. If these are missing, run the security migration:

```bash
psql "$DATABASE_URL" -f backend/migrations/001_security_trust_metrics.sql
```

---

## 11. Support

| Channel | Contact | Use for |
|---|---|---|
| **GitHub Issues** | https://github.com/[org]/be-trusted-registry/issues | Bug reports, feature requests |
| **Railway Dashboard** | https://railway.app/project/397377c8-5ca7-449d-915e-13deaf3ada76 | Deployment status, environment variables, logs |
| **Railway Support** | https://help.railway.app | Platform-level issues |
| **Stripe Dashboard** | https://dashboard.stripe.com | Payment events, webhook delivery, disputes |
| **Stripe Support** | https://support.stripe.com | Payment processing issues |
| **Owner** | B&E Consult FZCO | Escalation for data, security, or compliance issues |

---

## 12. Maintenance Schedule

| Task | Schedule | Mechanism | Log |
|---|---|---|---|
| DB backup | Daily 03:00 AM | LaunchAgent `com.be-registry.db-backup` | `/tmp/be-registry-backup-launchagent.log` |
| DB audit cycle (backup + dry-run restore) | Daily 03:30 AM | LaunchAgent `com.be-registry.db-audit` | `/tmp/be-registry-db-audit-launchagent.log` |
| Health monitoring | Every 5 minutes | LaunchAgent `com.be-registry.monitor` | `/tmp/be-registry-monitor-launchagent.log` |
| Prometheus scrape | Every 15 seconds | Prometheus (when stack is running) | Prometheus TSDB |
| Metrics snapshot | On demand / cron | `POST /api/metrics/snapshot` | `metrics_snapshot` table |
| Daily ops report | On demand / cron | `npm run ops:daily-report` | Slack |

**Verify all LaunchAgents are loaded:**

```bash
launchctl list | grep com.be-registry
```

Expected output (all three should appear with a PID or `0` exit code):

```
-   0   com.be-registry.monitor
-   0   com.be-registry.db-backup
-   0   com.be-registry.db-audit
```

**Reinstall all LaunchAgents after a machine restart:**

```bash
npm run monitor:launchagent:install
npm run db:backup:launchagent:install
npm run db:audit:launchagent:install
```

---

## 13. Pre-Production Checklist

Run this checklist before going live or after any major change.

### Environment variables

```
[ ] DATABASE_URL is set and points to Railway PostgreSQL
[ ] JWT_SECRET is set to a strong random value (not a test placeholder)
[ ] STRIPE_SECRET_KEY is set to sk_live_... (not sk_test_...)
[ ] STRIPE_WEBHOOK_SECRET is set to whsec_... (live webhook secret)
[ ] FRONTEND_URL is set to the production frontend URL
[ ] ENCRYPTION_KEY is set to a 64-character hex string
[ ] CORS_ORIGINS is set (or FRONTEND_URL covers all allowed origins)
```

### Service health

```
[ ] GET /api/health returns {"status":"ok"}
[ ] GET /metrics returns valid Prometheus text
[ ] GET /metrics/json returns valid JSON
[ ] GET /api/metrics/business returns valid JSON with non-zero counts
[ ] WebSocket /ws/metrics delivers a metrics frame within 15 seconds
```

### Authentication

```
[ ] POST /api/auth/register creates a user successfully
[ ] POST /api/auth/login returns a JWT token
[ ] Protected routes return 401 without a token
[ ] Protected routes return 200 with a valid token
```

### Stripe

```
[ ] npm run stripe:validate:live passes all checks
[ ] Checkout session URL contains cs_live_ (not cs_test_)
[ ] Webhook endpoint returns HTTP 400 for unsigned payloads
[ ] Stripe Dashboard shows the webhook endpoint as active
[ ] At least one test payment processed end-to-end
```

### Database

```
[ ] npm run db:smoke passes
[ ] npm run db:backup completes and produces a .dump file
[ ] npm run db:restore:dry-run passes
[ ] All migrations applied: psql "$DATABASE_URL" -c "\dt" shows all expected tables
[ ] Tables present: users, companies, missions, audit_log, trust_scores, fraud_alerts, metrics_snapshot
```

### Monitoring & alerting

```
[ ] LaunchAgents installed: launchctl list | grep com.be-registry (3 entries)
[ ] ntfy.sh test alert received on subscribed device
[ ] Slack test message delivered (if Slack is configured)
[ ] npm run monitor:prod passes
[ ] npm run dr:validate passes
```

### CI/CD

```
[ ] GitHub Actions CI passes on main branch
[ ] Preprod Gate workflow passes (if PREPROD_DATABASE_URL is configured)
[ ] Railway auto-deploy triggered and health check passes after last push to main
```

### Security

```
[ ] CORS restricted to production frontend URL only (not *)
[ ] JWT_SECRET rotated from any test/placeholder value
[ ] No secrets committed to the repository (check git log)
[ ] Stripe webhook secret matches the live endpoint in Stripe Dashboard
[ ] Fraud detection rules active (verify by checking fraud_alerts table after a test registration)
```
