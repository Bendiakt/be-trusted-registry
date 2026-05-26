-- 012_pac_achievements.sql
-- PAC achievement tracking + tier progression automation.
--
-- Achievement counters stored on pac_profiles to avoid expensive real-time aggregates:
--   missions_completed   — incremented when admin marks a mission completed
--   missions_on_time     — incremented when admin scores a mission (completed before deadline)
--   l2_missions_completed— incremented for L2+ missions
--   admin_score_total    — running sum of admin scores (divide by admin_score_count for avg)
--   admin_score_count    — count of scored missions
--   client_score_total   — running sum of client scores
--   client_score_count   — count of client-scored missions
--   double_rejections    — count of missions rejected twice by admin
--   supervised_s1_completed — completed missions by directly-supervised S1s
--   months_as_s2         — kept current by nightly cron
--
-- Eligibility flags (set by nightly cron, reset to FALSE on any subsequent promotion):
--   eligible_for_s2      — all S1→S2 criteria met, awaiting admin approval
--   eligible_for_s3      — all S2→S3 criteria met, awaiting Senior Board review
--   eligible_notified_at — timestamp of the last eligibility email (prevents duplicates)
--
-- Promotion timestamps (set by admin approve-upgrade endpoint):
--   promotion_date_s2    — ISO timestamp when agent was promoted to S2
--   promotion_date_s3    — ISO timestamp when agent was promoted to S3
--   tier_anniversary     — next annual billing date (promotion_date + 365 days)
--
-- License suspension tracking:
--   license_suspended_at   — set when membership_active flips to FALSE after payment failure
--   license_suspended_tier — tier at time of suspension (to restore correctly)

ALTER TABLE pac_profiles
  ADD COLUMN IF NOT EXISTS missions_completed         INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missions_on_time           INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_missions_completed      INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_score_total          INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_score_count          INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_score_total         INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_score_count         INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS double_rejections          INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervised_s1_completed    INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS months_as_s2               INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eligible_for_s2            BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eligible_for_s3            BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eligible_notified_at       TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS promotion_date_s2          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS promotion_date_s3          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tier_anniversary           DATE        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS license_suspended_at       TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS license_suspended_tier     TEXT        DEFAULT NULL;

-- Also update founder exemption to 24 months for S3F (was 12 in migration 011)
-- No data change needed — just a comment clarifying intent; the admin endpoint
-- already uses the correct duration defined in the founder contract.

-- Useful index for the nightly achievement cron
CREATE INDEX IF NOT EXISTS idx_pac_profiles_eligible_s2
  ON pac_profiles(eligible_for_s2) WHERE eligible_for_s2 = FALSE;
