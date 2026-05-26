-- Migration 013 — add due_date to missions for on-time tracking
-- Idempotent: all statements use IF NOT EXISTS / COALESCE guards
-- Applied by: npm run migrate (Railway preDeployCommand)

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS due_date DATE DEFAULT NULL;

-- Index for cron queries (renewal reminders, upcoming deadlines)
CREATE INDEX IF NOT EXISTS idx_missions_due_date
  ON missions(due_date)
  WHERE due_date IS NOT NULL;

COMMENT ON COLUMN missions.due_date IS
  'Optional deadline. If set, completed_at <= due_date counts toward missions_on_time on pac_profiles.';
