# Database Migration Strategy

Service: **be-trusted-registry** — Railway production  
Database: PostgreSQL (Railway managed, internal DNS `postgres.railway.internal:5432/railway`)  
Adapter: `backend/db.js` — `pg.Pool`, lazy-init, `CREATE TABLE IF NOT EXISTS` bootstrap

---

## Current Schema (as of v1.0.0-prod)

```sql
-- users
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'company',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- companies
CREATE TABLE IF NOT EXISTS companies (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT,
  company_name        TEXT,
  industry            TEXT,
  sector              TEXT,
  country             TEXT,
  description         TEXT,
  website             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  certification_level INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ
);

-- missions
CREATE TABLE IF NOT EXISTS missions (
  id          SERIAL PRIMARY KEY,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Migration Approach

### Principle
Migrations are **additive only** by default:
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — safe to re-run, never blocks reads
- `CREATE INDEX CONCURRENTLY` — no table lock
- `DROP COLUMN` / destructive ops → require explicit rollback window (see below)

### Execution Model
Migrations run as plain SQL files executed via `psql` or `node scripts/run-migration.js`.  
They are **not** embedded in application startup (`initDb()` is bootstrap-only, not a migration runner).

---

## Migration Lifecycle

### 1. Write the migration
Create a numbered SQL file:
```
migrations/
  001_add_users_last_login.sql
  002_add_companies_verified_at.sql
```

File naming: `NNN_description.sql` where NNN is zero-padded sequential number.

Example (`001_add_users_last_login.sql`):
```sql
-- Migration 001: add last_login column to users
-- Safe: additive, IF NOT EXISTS guard
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
```

### 2. Test locally (optional — requires public DB URL)
```bash
psql "$DATABASE_URL" -f migrations/001_add_users_last_login.sql
```

### 3. Apply in production via Railway
```bash
# One-shot: run migration inside Railway network
./scripts/railway-cli.sh run --service be-trusted-registry \
  node -e "
    const { query, initDb } = require('./backend/db');
    const fs = require('fs');
    const sql = fs.readFileSync('migrations/001_add_users_last_login.sql', 'utf8');
    query(sql).then(() => { console.log('PASS'); process.exit(0); }).catch(e => { console.error('FAIL', e.message); process.exit(1); });
  "
```

### 4. Verify
After applying:
```bash
npm run db:smoke    # counts tables, verifies connectivity (from Railway network)
npm run monitor:prod
```

---

## Rollback Procedures

### Case A — Additive column (safe rollback)
```sql
-- Rollback 001: drop last_login
ALTER TABLE users DROP COLUMN IF EXISTS last_login;
```
Apply the same way as the migration (step 3).

### Case B — Data migration rollback
1. Restore from the pre-migration backup:
   ```bash
   # Find the dump taken just before migration
   ls -1t backups/*.dump | head -3
   FORCE=1 ./scripts/db-restore.sh backups/be-registry-YYYYMMDDTHHMMSSZ.dump
   ```
2. Redeploy the previous git tag:
   ```bash
   git checkout v1.0.0-prod -- backend/
   git push origin main   # triggers Railway auto-deploy
   ```

### Case C — Emergency: full rollback to last known good
```bash
# 1. Restore DB from most recent backup (taken by daily LaunchAgent at 03:00)
FORCE=1 ./scripts/db-restore.sh "$(ls -1t backups/*.dump | head -1)"

# 2. Rollback Railway deployment to previous commit
./scripts/railway-cli.sh redeploy --service be-trusted-registry --yes
# or pin a specific commit via Railway Dashboard → Deployments → Rollback
```

---

## Pre-Migration Checklist

Before any schema change in production:

```
[ ] Take a manual backup:      npm run db:backup
[ ] Verify backup checksum:    shasum -a 256 backups/LATEST.dump
[ ] Check current table counts: npm run db:smoke  (from Railway network)
[ ] Confirm app is healthy:     npm run monitor:prod
[ ] Notify stakeholders of maintenance window (if table lock expected)
[ ] Have rollback SQL ready before applying forward migration
```

---

## Adding a Migration Runner (future)

When the number of migrations grows, replace manual apply with a lightweight runner:

```bash
npm install --save-dev db-migrate db-migrate-pg
```

Or use the built-in approach with a `migrations` table to track applied migrations:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## References

- Daily backup: `scripts/db-backup.sh` (LaunchAgent `com.be-registry.db-backup`, 03:00 daily, 7-dump rotation)
- Restore: `scripts/db-restore.sh`
- Smoke test: `scripts/db-smoke.js`
- DB pool: `backend/db.js`
- Runbook: `DB_OPERATIONS.md`
