-- 001_security_trust_metrics.sql
-- Versioned migration for security/trust/fraud/metrics features.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource TEXT,
  ip_address TEXT,
  payload_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trust_scores (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'unknown',
  indicators JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low',
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metrics_snapshot (
  id SERIAL PRIMARY KEY,
  users_count INTEGER DEFAULT 0,
  companies_count INTEGER DEFAULT 0,
  certified_count INTEGER DEFAULT 0,
  fraud_alerts_count INTEGER DEFAULT 0,
  avg_trust_score NUMERIC(5,2) DEFAULT 0,
  revenue_total NUMERIC(12,2) DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Useful indexes for read paths and fraud checks
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_ip_created ON audit_log (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_scores_company_computed ON trust_scores (company_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user_created ON fraud_alerts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_active ON fraud_alerts (resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_at ON metrics_snapshot (snapshot_at DESC);

COMMIT;
