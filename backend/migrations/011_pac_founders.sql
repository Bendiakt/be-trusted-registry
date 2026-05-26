-- 011_pac_founders.sql
-- PAC S3 Founder programme — B&E-selected senior agents with Y1 membership exemption.
--
-- is_founder               : toggled by admin PATCH /api/admin/pac/:id/founder
-- founder_exemption_expires: 1 year from grant date — no Stripe charge during this window
-- founder_region           : one of west_africa | central_east_africa | mena | europe | asia
--                            used for mission routing and Advisory Council organisation

ALTER TABLE pac_profiles
  ADD COLUMN IF NOT EXISTS is_founder               BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS founder_exemption_expires DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS founder_region            VARCHAR(50) DEFAULT NULL;

-- Partial index — only the small subset of active founders, near-zero cost
CREATE INDEX IF NOT EXISTS idx_pac_profiles_is_founder
  ON pac_profiles(is_founder) WHERE is_founder = TRUE;
