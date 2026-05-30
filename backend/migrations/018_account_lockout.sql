-- 018_account_lockout.sql
-- Adds account-lockout columns to users that were missing from the migration
-- trail (they existed on production via a manual ALTER TABLE but were never
-- committed as a versioned migration).
--
-- Safe to run on existing databases: all statements use IF NOT EXISTS / DO $$.

-- Track consecutive failed logins — triggers lockout after MAX_FAILED_ATTEMPTS.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

-- Lockout expiry timestamp — NULL means account is not locked.
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- gdpr_erasure_requested_at — present in baseline schema but missing from
-- initDb() used on fresh databases prior to this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'gdpr_erasure_requested_at'
  ) THEN
    ALTER TABLE users ADD COLUMN gdpr_erasure_requested_at TIMESTAMPTZ;
  END IF;
END $$;

-- updated_at fallback — already guarded in 005, but insurance for databases
-- where 005 ran before the column check existed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index: fast lookup of locked accounts (health-check for lockout cleanup cron).
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users (locked_until)
  WHERE locked_until IS NOT NULL;
