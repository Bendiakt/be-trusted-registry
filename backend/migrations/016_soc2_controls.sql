-- 016_soc2_controls.sql
-- SOC 2 Type I — Technical controls (CC6.1, CC6.3, CC7.2)
--
-- 1. refresh_tokens: add session context columns (user_agent, ip_address)
--    Enables GET /api/auth/sessions — users can see and revoke their own sessions.
--    These fields are populated on login/refresh going forward; existing rows remain NULL.
--
-- 2. audit_log: append-only enforcement via trigger (CC7.2 — Monitoring Controls).
--    Prevents any direct deletion of audit_log rows whose owner account is still
--    active (email NOT LIKE '%@deleted.invalid').
--    The authorised PII retention cron (which targets only fully-anonymised accounts)
--    is explicitly exempted by the trigger condition.

-- ── 1. Session context on refresh_tokens ──────────────────────────────────────
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

COMMENT ON COLUMN refresh_tokens.user_agent IS 'Browser / client UA at session creation — used for session listing UI';
COMMENT ON COLUMN refresh_tokens.ip_address IS 'Client IP at session creation — used for session listing UI';

-- ── 2. Audit log tamper-protection trigger (SOC 2 CC7.2) ─────────────────────
CREATE OR REPLACE FUNCTION protect_audit_log_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Look up the owning user's current email.
  SELECT email INTO user_email
    FROM users WHERE id = OLD.user_id;

  -- Allow deletion ONLY when the account has been fully anonymised
  -- (GDPR/right-to-erasure path stamps email as <uuid>@deleted.invalid).
  IF user_email IS NULL OR user_email NOT LIKE '%@deleted.invalid' THEN
    RAISE EXCEPTION
      'audit_log: deletion of active-account rows is prohibited (SOC 2 CC7.2). '
      'Authorised purges must target anonymised accounts only.'
      USING ERRCODE = '55006';  -- object_not_in_prerequisite_state
  END IF;

  -- Deletion allowed for anonymised accounts — return OLD to proceed.
  RETURN OLD;
END;
$$;

-- Drop first so re-running the migration is idempotent.
DROP TRIGGER IF EXISTS audit_log_tamper_protection ON audit_log;

CREATE TRIGGER audit_log_tamper_protection
  BEFORE DELETE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION protect_audit_log_delete();

COMMENT ON TRIGGER audit_log_tamper_protection ON audit_log
  IS 'SOC 2 CC7.2 — Blocks deletion of audit entries for active accounts. '
     'Only the PII retention cron (targeting @deleted.invalid accounts) may delete rows.';
