# Disaster Recovery Runbook

## Scope
This runbook covers production recovery for be-registry:
- backend service: be-trusted-registry (Railway)
- frontend service: frontend (Railway)
- primary DB: Postgres (Railway managed)
- backups: local encrypted dumps under backups/ + automated LaunchAgent jobs

## SLO Targets
- RTO target: 30 minutes
- RPO target: 24 hours (daily backup), improved to current cycle when manual backup exists

## Incident Severity
- SEV1: Full outage, data corruption, unrecoverable deploy
- SEV2: Partial outage, degraded API, backup/audit pipeline broken

## Immediate Response (T+0 to T+5)
1. Confirm incident scope:
   - backend health: /api/health
   - metrics endpoint: /metrics
   - recent deploy status via Railway
2. Freeze risky actions:
   - stop schema changes
   - stop manual variable edits unless approved by incident lead
3. Start incident log:
   - UTC timestamps
   - actions taken
   - command outputs (sanitized)

## Recovery Decision Tree
1. If backend unhealthy after a new deploy:
   - trigger automated failover script: scripts/auto-failover.sh
   - if unresolved, rollback deployment in Railway Dashboard
2. If DB reachable but app errors persist:
   - run db smoke and audit cycle
   - compare row counts with last known-good snapshot
3. If DB corruption or accidental data loss confirmed:
   - restore from latest valid dump to temp DB
   - validate integrity
   - restore into production only after sign-off

## Standard Recovery Commands

### 1) Health + baseline checks
```bash
npm run monitor:prod
npm run db:smoke
npm run db:audit:cycle
```

### 2) Failover attempts (automated)
```bash
bash scripts/auto-failover.sh
```

### 3) Create immediate backup before invasive recovery
```bash
npm run db:backup
```

### 4) Validate latest backup via restore dry-run
```bash
npm run db:restore:dry-run
```

### 5) Controlled production restore (destructive)
```bash
DATABASE_URL='postgresql://...public...' FORCE=1 npm run db:restore -- backups/<dump>.dump
```

## Post-Recovery Verification
1. Backend health stable for 15 minutes
2. Auth flow works (register/login)
3. Stripe checkout session creation works
4. Metrics endpoint returns valid payload
5. LaunchAgent jobs still loaded:
   - com.be-registry.db-backup
   - com.be-registry.db-audit
   - com.be-registry.monitor

## Communication Template
- Incident start (UTC)
- User impact summary
- Root cause (preliminary/final)
- Recovery actions and timestamps
- Data integrity confirmation
- Follow-up corrective actions

## Corrective Actions After Incident
1. Rotate any exposed secrets (JWT/Stripe/webhooks)
2. Re-run db audit cycle and archive result
3. Add regression alert for the trigger metric
4. Schedule postmortem within 48h
