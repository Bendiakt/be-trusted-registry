-- 004_trader_watchlist.sql
-- Trader Portal: watchlist lets trader-role users track certified companies.
-- Note: migrate.js wraps each file in its own BEGIN/COMMIT — do NOT add one here.

CREATE TABLE IF NOT EXISTS trader_watchlist (
  id         SERIAL      PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  company_id INTEGER     NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_trader_watchlist_user    ON trader_watchlist (user_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_trader_watchlist_company ON trader_watchlist (company_id);
