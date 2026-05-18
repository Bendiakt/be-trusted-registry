-- 006_missing_indexes.sql
-- Performance indexes identified as missing from the initial schema.
-- All statements are idempotent (IF NOT EXISTS).
-- Note: migrate.js wraps each file in its own BEGIN/COMMIT — do NOT add one here.

-- ── companies.user_id ─────────────────────────────────────────────────────────
-- Hot path: queried on almost every authenticated request
-- ("SELECT id FROM companies WHERE user_id = $1 LIMIT 1")
CREATE INDEX IF NOT EXISTS idx_companies_user_id
  ON companies (user_id)
  WHERE user_id IS NOT NULL;

-- ── certifications: status + expiry compound ──────────────────────────────────
-- Used by the renewal-reminder and cert-expiry cron jobs:
--   WHERE status = 'active' AND expires_at BETWEEN NOW() + INTERVAL '...' AND ...
-- The existing idx_certifications_expires is a partial single-column index;
-- this compound index eliminates the status filter scan on every cron run.
CREATE INDEX IF NOT EXISTS idx_certifications_status_expires
  ON certifications (status, expires_at)
  WHERE expires_at IS NOT NULL;

-- ── documents: user_id ────────────────────────────────────────────────────────
-- DELETE /api/documents/:id queries: WHERE id = $1 AND user_id = $2 AND status = 'pending'
-- The existing idx_documents_company covers company-level queries; user-level delete needs this.
CREATE INDEX IF NOT EXISTS idx_documents_user_status
  ON documents (user_id, status);

-- ── notifications: all rows per user (non-partial) ───────────────────────────
-- GET /api/notifications lists ALL notifications (read + unread) ordered by created_at.
-- The existing idx_notifications_user_unread is partial (WHERE read_at IS NULL),
-- so it's skipped for full-list queries. This non-partial index covers that path.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- ── audit_log: action filter ──────────────────────────────────────────────────
-- Admin audit-log endpoint filters by action ILIKE $N.
-- A trigram index (pg_trgm) would be ideal but requires the extension;
-- a plain btree on action still halves scan cost for equality / prefix lookups.
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log (action);
