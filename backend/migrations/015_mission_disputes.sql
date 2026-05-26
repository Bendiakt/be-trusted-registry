-- Migration 015 — mission dispute / appeal workflow
-- Companies can open a dispute on a completed mission (e.g. contested outcome).
-- Admin resolves with one of: upheld / dismissed / second_audit.
-- Safe to re-run (IF NOT EXISTS throughout).

CREATE TABLE IF NOT EXISTS mission_disputes (
  id              SERIAL       PRIMARY KEY,
  mission_id      INTEGER      NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  company_id      INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  opened_by       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','resolved')),
  resolution      TEXT         DEFAULT NULL
    CHECK (resolution IS NULL OR resolution IN ('upheld','dismissed','second_audit')),
  resolution_note TEXT         DEFAULT NULL,
  resolved_by     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ  DEFAULT NULL,
  -- One dispute per mission maximum
  UNIQUE (mission_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_disputes_status     ON mission_disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_company    ON mission_disputes(company_id);
CREATE INDEX IF NOT EXISTS idx_disputes_mission    ON mission_disputes(mission_id);

INSERT INTO schema_migrations (version) VALUES ('015_mission_disputes')
  ON CONFLICT (version) DO NOTHING;
