-- 003_missing_columns.sql
-- Ensures columns and tables that were added via manual PROD_SETUP.sql also exist
-- on fresh deploys and any environment that doesn't use PROD_SETUP.sql directly.
-- Note: migrate.js wraps each file in its own BEGIN/COMMIT — do NOT add one here.

-- Email verification flag (added in PROD_SETUP.sql)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Certification lifecycle columns (added in PROD_SETUP.sql)
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ;

-- Company suspension (added in PROD_SETUP.sql)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Notifications table (added in PROD_SETUP.sql)
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL      PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON notifications (user_id, read_at) WHERE read_at IS NULL;
