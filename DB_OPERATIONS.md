# PostgreSQL Operations Runbook

This runbook covers backup, restore, and smoke checks for production PostgreSQL.

## 1) Prerequisites

- `DATABASE_URL` is set for the target database.
- PostgreSQL client tools are installed for backup/restore:

```bash
brew install libpq
brew link --force libpq
```

## 2) Daily/Before-change checklist

1. Verify app health:

```bash
npm run monitor:prod
```

2. Verify DB connectivity and table counts:

```bash
npm run db:smoke
```

3. Create a backup before schema or critical changes:

```bash
npm run db:backup
```

4. Store backup artifact in a safe location (encrypted vault/object storage).

## 3) Backup

Create a custom-format dump under `backups/`:

```bash
npm run db:backup
```

Optional output directory:

```bash
BACKUP_DIR=/tmp/db-backups npm run db:backup
```

## 4) Restore (dangerous)

Restore a dump to the database pointed by `DATABASE_URL`:

```bash
FORCE=1 ./scripts/db-restore.sh backups/be-registry-YYYYMMDDTHHMMSSZ.dump
```

Without `FORCE=1`, script asks explicit confirmation.

## 5) Post-restore verification

```bash
npm run db:smoke
npm run monitor:prod
npm run stripe:validate:live
```

## 6) Railway guidance

- Keep PostgreSQL in the same Railway project as backend.
- Ensure backend service has `DATABASE_URL` injected from Railway PostgreSQL service.
- After redeploy/restart, verify persistence quickly:

```bash
node scripts/persistence-proof.js init
./scripts/railway-cli.sh redeploy --service be-trusted-registry --yes
node scripts/persistence-proof.js verify
```

## 7) Security notes

- Never commit `DATABASE_URL` or dump files.
- Rotate database credentials after any suspected leakage.
- Restrict operator access to backup artifacts.
