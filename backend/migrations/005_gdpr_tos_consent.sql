-- 005_gdpr_tos_consent.sql
-- Adds ToS version tracking + GDPR soft-delete support to the users table.
-- Safe to run multiple times (all statements use IF NOT EXISTS / DO $$ patterns).

-- ToS consent version column — records which version of the ToS the user accepted.
-- Null = pre-feature (user registered before versioned ToS was introduced).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'tos_version'
  ) THEN
    ALTER TABLE users ADD COLUMN tos_version TEXT;
    COMMENT ON COLUMN users.tos_version IS 'Version identifier of the Terms of Service accepted at registration (e.g. "2025-01"). NULL = registered before versioned ToS.';
  END IF;
END $$;

-- Timestamp of ToS acceptance (complements tos_version for GDPR audit trail).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'tos_accepted_at'
  ) THEN
    ALTER TABLE users ADD COLUMN tos_accepted_at TIMESTAMPTZ;
  END IF;
END $$;

-- updated_at column on users — needed for soft-delete and profile update tracking.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- user_id index on audit_log for fast GDPR export query.
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id);

-- user_id index on notifications for fast GDPR export query.
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
