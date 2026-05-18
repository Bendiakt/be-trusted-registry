-- ── Chantier 1 : API-first tier ────────────────────────────────────────────
-- API keys allow B2B integrations (white-label partners, ERPs, mandataires)
-- to authenticate against public endpoints without a user session.
--
-- Design:
--   - hashed_key   : SHA-256 of the raw key. Only the hash is stored.
--   - prefix        : first 8 chars of raw key (e.g. "mydd_pk_"). Used for
--                     display/lookup without exposing the full secret.
--   - scopes        : JSON array e.g. ["registry:read", "verify:read"]
--   - rate_limit     : requests per minute (default 60)
--   - last_used_at  : updated on every authenticated request (async)

CREATE TABLE IF NOT EXISTS api_keys (
  id            SERIAL       PRIMARY KEY,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT         NOT NULL,                         -- human label
  prefix        TEXT         NOT NULL UNIQUE,                  -- first 8 chars, shown in UI
  hashed_key    TEXT         NOT NULL UNIQUE,                  -- SHA-256 hex
  scopes        JSONB        NOT NULL DEFAULT '["registry:read","verify:read"]',
  rate_limit    INTEGER      NOT NULL DEFAULT 60,              -- req/min
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,                                   -- NULL = no expiry
  revoked       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id    ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix     ON api_keys (prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_hashed_key ON api_keys (hashed_key);

-- Usage metering — one row per calendar day per key (upserted on each request)
CREATE TABLE IF NOT EXISTS api_key_usage (
  id          SERIAL  PRIMARY KEY,
  api_key_id  INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  day         DATE    NOT NULL DEFAULT CURRENT_DATE,
  requests    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (api_key_id, day)
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_day ON api_key_usage (api_key_id, day);
