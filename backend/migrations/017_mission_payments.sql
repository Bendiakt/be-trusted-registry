-- 017_mission_payments.sql
-- Add mission_id FK to payments so mission-fee Stripe sessions are traceable.
-- missions.payment_confirmed_at already exists (added in 010_pac_supervision.sql).
-- missions.commission_amount_cents already exists (added in 010_pac_supervision.sql).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mission_id INTEGER REFERENCES missions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_mission ON payments(mission_id)
  WHERE mission_id IS NOT NULL;
