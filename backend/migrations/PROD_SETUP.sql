-- PROD_SETUP.sql
-- Combined production migration: 001 + 002 enriched.
-- Run once in Railway → PostgreSQL → Query tab.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS — safe to re-run.

BEGIN;

-- ─── Migration tracking ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  id         SERIAL      PRIMARY KEY,
  version    TEXT        NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 001: Security / Trust / Fraud / Metrics ─────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL      PRIMARY KEY,
  user_id      INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT        NOT NULL,
  resource     TEXT,
  ip_address   TEXT,
  payload_hash TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trust_scores (
  id          SERIAL      PRIMARY KEY,
  company_id  INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  score       INTEGER     NOT NULL DEFAULT 0,
  risk_level  TEXT        NOT NULL DEFAULT 'unknown',
  indicators  JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id         SERIAL      PRIMARY KEY,
  user_id    INTEGER     REFERENCES users(id)     ON DELETE SET NULL,
  company_id INTEGER     REFERENCES companies(id) ON DELETE SET NULL,
  rule       TEXT        NOT NULL,
  severity   TEXT        NOT NULL DEFAULT 'low',
  resolved   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics_snapshot (
  id                 SERIAL        PRIMARY KEY,
  users_count        INTEGER       DEFAULT 0,
  companies_count    INTEGER       DEFAULT 0,
  certified_count    INTEGER       DEFAULT 0,
  fraud_alerts_count INTEGER       DEFAULT 0,
  avg_trust_score    NUMERIC(5,2)  DEFAULT 0,
  revenue_total      NUMERIC(12,2) DEFAULT 0,
  snapshot_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── 002: Payments / Auth / JWT revocation ───────────────────────────────────

CREATE TABLE IF NOT EXISTS token_blacklist (
  id         SERIAL      PRIMARY KEY,
  jti        TEXT        NOT NULL UNIQUE,
  user_id    INTEGER     REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL      PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certifications (
  id                SERIAL      PRIMARY KEY,
  company_id        INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  level             INTEGER     NOT NULL DEFAULT 1,
  status            TEXT        NOT NULL DEFAULT 'pending',
  payment_confirmed BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id                       SERIAL      PRIMARY KEY,
  user_id                  INTEGER     REFERENCES users(id)          ON DELETE SET NULL,
  company_id               INTEGER     REFERENCES companies(id)      ON DELETE SET NULL,
  stripe_session_id        TEXT        UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_cents             INTEGER     NOT NULL,
  currency                 TEXT        NOT NULL DEFAULT 'usd',
  plan_id                  TEXT,
  status                   TEXT        NOT NULL DEFAULT 'pending',
  certification_id         INTEGER     REFERENCES certifications(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Enrichments: new columns on existing tables (safe to re-run) ─────────────

-- certifications: lifecycle timestamps
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS granted_at  TIMESTAMPTZ;
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;

-- payments: Stripe metadata + extra context
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- refresh_tokens: enforce uniqueness on token_hash (code relies on single-row lookup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'refresh_tokens_token_hash_key'
      AND conrelid = 'refresh_tokens'::regclass
  ) THEN
    ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);
  END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created     ON audit_log     (user_id,    created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_ip_created       ON audit_log     (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_scores_company       ON trust_scores  (company_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user_created  ON fraud_alerts  (user_id,    created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_active        ON fraud_alerts  (resolved,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_at        ON metrics_snapshot (snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti        ON token_blacklist (jti);
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist (expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens  (user_id, revoked_at, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_certifications_company     ON certifications  (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_company_created   ON payments        (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status_created    ON payments        (status,     created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent     ON payments        (stripe_payment_intent_id);

-- ─── Revenue stats view ───────────────────────────────────────────────────────

CREATE OR REPLACE VIEW revenue_stats AS
SELECT
  COALESCE(SUM(amount_cents) FILTER (WHERE status = 'completed'), 0)                          AS revenue_total_cents,
  ROUND(COALESCE(SUM(amount_cents) FILTER (WHERE status = 'completed'), 0)::numeric / 100, 2)  AS revenue_total_usd,
  COUNT(*) FILTER (WHERE status = 'completed')                                                 AS payments_completed,
  COUNT(*) FILTER (WHERE status = 'pending')                                                   AS payments_pending,
  COUNT(*) FILTER (WHERE status = 'failed')                                                    AS payments_failed,
  COUNT(*) FILTER (WHERE status = 'refunded')                                                  AS payments_refunded,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status = 'completed')    AS payments_last_30d,
  ROUND(COALESCE(SUM(amount_cents) FILTER (
    WHERE created_at > NOW() - INTERVAL '30 days' AND status = 'completed'
  ), 0)::numeric / 100, 2)                                                                     AS revenue_last_30d_usd
FROM payments;

-- ─── Missions: enrich with PAC workflow columns ──────────────────────────────

ALTER TABLE missions ADD COLUMN IF NOT EXISTS company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS location     TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS type         TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS fee_usd      INTEGER NOT NULL DEFAULT 500;

-- Default status fix (was 'pending', should be 'available' for new rows)
-- Existing rows untouched — just update truly-unassigned ones:
UPDATE missions SET status = 'available' WHERE status = 'pending' AND assigned_to IS NULL;

-- ─── PAC agent profiles ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pac_profiles (
  id             SERIAL      PRIMARY KEY,
  user_id        INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name      TEXT,
  location       TEXT,
  languages      TEXT,
  certifications TEXT,
  bio            TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users / Companies: extra columns ────────────────────────────────────────

ALTER TABLE users     ADD COLUMN IF NOT EXISTS last_login  TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ─── Password reset tokens ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL      PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_hash    ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at);

-- ─── Performance: certified-company lookup (Trader Portal) ───────────────────

CREATE INDEX IF NOT EXISTS idx_companies_certified_country
  ON companies(country, certification_level)
  WHERE certification_level > 0;

-- ─── Fix mission status: 'pending' unassigned → 'available' ─────────────────

UPDATE missions SET status = 'available' WHERE status IN ('pending','accepted') AND assigned_to IS NULL;

-- ─── Register migrations ──────────────────────────────────────────────────────

INSERT INTO schema_migrations (version) VALUES ('001_security_trust_metrics') ON CONFLICT (version) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('002_payments_auth_hotfix')   ON CONFLICT (version) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('003_enrichments')            ON CONFLICT (version) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('004_missions_pac_profiles')  ON CONFLICT (version) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('005_password_reset_trader')  ON CONFLICT (version) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('006_mission_reports')         ON CONFLICT (version) DO NOTHING;

-- ─── 006: Mission inspection reports ─────────────────────────────────────────

ALTER TABLE missions ADD COLUMN IF NOT EXISTS report_text  TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS outcome      TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Index for fast completed-mission lookups
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_assigned_to ON missions(assigned_to) WHERE assigned_to IS NOT NULL;

-- ─── 007: Email verification ─────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified        BOOLEAN     DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(email_verify_token) WHERE email_verify_token IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('007_email_verification') ON CONFLICT (version) DO NOTHING;

-- ─── 008: Stripe customer ID ─────────────────────────────────────────────────

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer ON companies(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('008_stripe_customer_id') ON CONFLICT (version) DO NOTHING;

-- ─── 009: Renewal reminders + company suspension ──────────────────────────────

ALTER TABLE certifications ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE companies      ADD COLUMN IF NOT EXISTS suspended_at              TIMESTAMPTZ;
ALTER TABLE companies      ADD COLUMN IF NOT EXISTS suspended_reason           TEXT;

CREATE INDEX IF NOT EXISTS idx_certifications_expires ON certifications(expires_at) WHERE expires_at IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('009_renewal_suspension') ON CONFLICT (version) DO NOTHING;

-- ─── 010: Document uploads ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  company_id    INT          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       INT          NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  file_name     TEXT         NOT NULL,
  original_name TEXT         NOT NULL,
  mime_type     TEXT         NOT NULL,
  size_bytes    INT          NOT NULL,
  storage_path  TEXT         NOT NULL,  -- local path or R2 key
  doc_type      TEXT         NOT NULL DEFAULT 'general',  -- id, financial, legal, general
  status        TEXT         NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
  reviewed_by   INT          REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_status  ON documents(status);

INSERT INTO schema_migrations (version) VALUES ('010_documents') ON CONFLICT (version) DO NOTHING;

COMMIT;
