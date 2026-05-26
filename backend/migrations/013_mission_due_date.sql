-- Migration 013 — mission due_date + client scoring columns
-- Idempotent: all statements use IF NOT EXISTS guards
-- Applied by: npm run migrate (Railway preDeployCommand)

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS due_date          DATE        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_score      INTEGER     DEFAULT NULL,  -- 1–5 company rating of agent
  ADD COLUMN IF NOT EXISTS client_scored_at  TIMESTAMPTZ DEFAULT NULL;

-- Index for upcoming deadline queries
CREATE INDEX IF NOT EXISTS idx_missions_due_date
  ON missions(due_date)
  WHERE due_date IS NOT NULL;

-- Index for unscored completed missions (admin backlog)
CREATE INDEX IF NOT EXISTS idx_missions_unscored
  ON missions(status, client_scored_at)
  WHERE status = 'completed' AND client_scored_at IS NULL;

COMMENT ON COLUMN missions.due_date IS
  'Optional deadline. completed_at <= due_date counts toward missions_on_time on pac_profiles.';
COMMENT ON COLUMN missions.client_score IS
  '1–5 company satisfaction rating of the PAC agent. Updates client_score_total/count on pac_profiles.';
