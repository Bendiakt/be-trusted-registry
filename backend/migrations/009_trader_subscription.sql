-- 009_trader_subscription.sql
-- Trader Portal billing: adds Stripe subscription tracking to users table.
-- Traders pay a monthly ($49) or annual ($499) subscription to access /trader.

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status      TEXT DEFAULT 'inactive'
  CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'cancelled'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan        TEXT
  CHECK (subscription_plan IN ('trader_monthly', 'trader_annual'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_period_end  TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_subscription_status
  ON users(subscription_status)
  WHERE subscription_status IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('009_trader_subscription')
ON CONFLICT (version) DO NOTHING;
