-- 010_pac_supervision.sql
-- PAC Network v3.0 — Multi-level supervision architecture
-- Safe to run on existing databases (IF NOT EXISTS / IF NOT EXISTS throughout).
--
-- Tables introduced:
--   pac_profiles      → add pac_tier, kyc_status, membership columns
--   pac_supervision   → S2→S1 and S3→S2 supervision pairs
--   pac_supervision_tasks → weekly/monthly task log per supervisor
--   pac_bonus_payouts → monthly bonus statements (M+1 rule)
--   missions          → add pac_tier_required, admin_score, payment_confirmed_at

-- ── 1. Extend pac_profiles with tier + KYC + membership ──────────────────────
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS pac_tier       TEXT    NOT NULL DEFAULT 'S1'
  CHECK (pac_tier IN ('S1','S2','S3'));
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS kyc_status     TEXT    NOT NULL DEFAULT 'pending'
  CHECK (kyc_status IN ('pending','approved','rejected','suspended'));
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10;
  -- S1: 0.10 (10%), S2: 0.15 (15%), S3: 0.20 (20%)
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS membership_stripe_sub_id TEXT;
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS membership_active  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS membership_expires TIMESTAMPTZ;
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS max_supervised    INTEGER NOT NULL DEFAULT 0;
  -- S1: 0, S2: 10, S3: 5 (S2s supervised, not S1s)
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS supervision_score NUMERIC(3,2) DEFAULT NULL;
  -- Running average of B&E supervision scoring (1–5)
ALTER TABLE pac_profiles ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_pac_profiles_tier   ON pac_profiles (pac_tier);
CREATE INDEX IF NOT EXISTS idx_pac_profiles_kyc    ON pac_profiles (kyc_status);

-- ── 2. Extend missions with tier + scoring + payment confirmation ─────────────
ALTER TABLE missions ADD COLUMN IF NOT EXISTS pac_tier_required TEXT DEFAULT 'S1'
  CHECK (pac_tier_required IN ('S1','S2','S3'));
ALTER TABLE missions ADD COLUMN IF NOT EXISTS admin_score       INTEGER
  CHECK (admin_score BETWEEN 1 AND 5);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS admin_scored_at   TIMESTAMPTZ;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
  -- Set when Stripe invoice.paid webhook fires — triggers M+1 bonus eligibility
ALTER TABLE missions ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS commission_amount_cents INTEGER;
  -- Actual commission paid to PAC (fee_usd × commission_rate × 100)

CREATE INDEX IF NOT EXISTS idx_missions_payment_confirmed ON missions (payment_confirmed_at)
  WHERE payment_confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missions_tier ON missions (pac_tier_required);

-- ── 3. pac_supervision — supervisor/supervised pairs ─────────────────────────
-- Covers both S2→S1 and S3→S2 relationships.
-- A supervision request is created by the supervisor and approved by B&E admin.
CREATE TABLE IF NOT EXISTS pac_supervision (
  id              SERIAL      PRIMARY KEY,
  supervisor_id   INTEGER     NOT NULL REFERENCES pac_profiles(id) ON DELETE CASCADE,
  supervised_id   INTEGER     NOT NULL REFERENCES pac_profiles(id) ON DELETE CASCADE,
  supervisor_tier TEXT        NOT NULL CHECK (supervisor_tier IN ('S2','S3')),
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','terminated')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  approved_by     INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  terminated_at   TIMESTAMPTZ,
  terminated_reason TEXT,
  UNIQUE (supervisor_id, supervised_id)
);

CREATE INDEX IF NOT EXISTS idx_pac_supervision_supervisor ON pac_supervision (supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_pac_supervision_supervised ON pac_supervision (supervised_id, status);

-- ── 4. pac_supervision_tasks — weekly/monthly task completion log ─────────────
-- One row per task per period per supervisor.
-- B&E admin reviews and scores; the cron job reads completion % before paying.
CREATE TABLE IF NOT EXISTS pac_supervision_tasks (
  id              SERIAL      PRIMARY KEY,
  supervisor_id   INTEGER     NOT NULL REFERENCES pac_profiles(id) ON DELETE CASCADE,
  period_year     INTEGER     NOT NULL,   -- e.g. 2026
  period_month    INTEGER     NOT NULL,   -- 1–12
  period_week     INTEGER,               -- ISO week number (NULL for monthly tasks)
  task_type       TEXT        NOT NULL
    CHECK (task_type IN (
      'weekly_checkin',        -- S2: individual check-in with each S1
      'weekly_report_review',  -- S2: review S1 reports + structured feedback
      'weekly_mentoring',      -- S3: mentoring S2
      'weekly_spot_check',     -- S3: audit 2 random S1 reports
      'monthly_supervision_report', -- S2: monthly supervision report
      'monthly_training',      -- S2: collective training session
      'monthly_executive_report',   -- S3: executive report
      'monthly_strategic_session',  -- S3: session with B&E HQ
      'quarterly_s2_evaluation',    -- S3: formal S2 evaluation
      'ad_hoc_escalation'      -- any tier: incident/risk escalation
    )),
  completed       BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  admin_score     INTEGER     CHECK (admin_score BETWEEN 1 AND 5),
  notes           TEXT,
  evidence_url    TEXT,   -- link to submitted report / recording
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supervisor_id, period_year, period_month, period_week, task_type)
);

CREATE INDEX IF NOT EXISTS idx_pac_tasks_supervisor_period
  ON pac_supervision_tasks (supervisor_id, period_year, period_month);

-- ── 5. pac_bonus_payouts — monthly bonus statements (M+1 rule) ───────────────
-- Generated by the bonus cron on the 1st of each month for the previous month.
-- Admin validates within 48h, then payment is issued before the 10th.
CREATE TABLE IF NOT EXISTS pac_bonus_payouts (
  id                    SERIAL      PRIMARY KEY,
  supervisor_id         INTEGER     NOT NULL REFERENCES pac_profiles(id) ON DELETE CASCADE,
  period_year           INTEGER     NOT NULL,
  period_month          INTEGER     NOT NULL,  -- month M (missions completed in M)
  bonus_level           TEXT        NOT NULL CHECK (bonus_level IN ('L1','L2')),
    -- L1 = direct supervisees (S2→S1 or S3→S2)
    -- L2 = indirect (S3 on S1s in their org)
  missions_count        INTEGER     NOT NULL DEFAULT 0,
  gross_revenue_cents   INTEGER     NOT NULL DEFAULT 0,  -- Σ mission values
  commissions_paid_cents INTEGER    NOT NULL DEFAULT 0,  -- Σ PAC commissions
  net_be_revenue_cents  INTEGER     NOT NULL DEFAULT 0,  -- gross − commissions
  bonus_rate            NUMERIC(5,4) NOT NULL,           -- 0.05 or 0.02
  bonus_amount_cents    INTEGER     NOT NULL DEFAULT 0,
  task_completion_pct   NUMERIC(5,2) NOT NULL DEFAULT 0, -- 0–100%
  bonus_multiplier      NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    -- 1.00 if ≥80%, 0.50 if 70–79%, 0.00 if <70%
  final_bonus_cents     INTEGER     NOT NULL DEFAULT 0,  -- bonus × multiplier
  status                TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','validated','paid','suspended','cancelled')),
  validated_by          INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  validated_at          TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  payment_reference     TEXT,   -- SWIFT/SEPA reference
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supervisor_id, period_year, period_month, bonus_level)
);

CREATE INDEX IF NOT EXISTS idx_pac_bonus_supervisor ON pac_bonus_payouts (supervisor_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_pac_bonus_status     ON pac_bonus_payouts (status, period_year, period_month);
