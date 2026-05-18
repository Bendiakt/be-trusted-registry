-- ── Chantier 4 : Enterprise webhook delivery system ─────────────────────────
-- Partners (ERP, white-label, mandataires) register endpoint URLs here.
-- When a certification status changes, we POST a signed payload to every
-- active endpoint registered for that event type.
--
-- Signature:
--   HMAC-SHA256(raw_body, secret) sent as X-MyDD-Signature: sha256=<hex>
--
-- Retry policy is managed in application code (lib/webhookDispatch.js):
--   up to 5 attempts with exponential back-off (30 s → 60 s → 120 s → 300 s → 600 s)

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id          SERIAL       PRIMARY KEY,
  user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT         NOT NULL,                       -- HTTPS target URL
  secret      TEXT         NOT NULL,                       -- HMAC signing secret (stored encrypted)
  events      JSONB        NOT NULL DEFAULT '["cert.status_changed"]',
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user_id ON webhook_endpoints (user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active  ON webhook_endpoints (active) WHERE active = TRUE;

-- Delivery log — one row per attempted dispatch
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              SERIAL       PRIMARY KEY,
  endpoint_id     INTEGER      NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type      TEXT         NOT NULL,   -- e.g. "cert.status_changed"
  payload         JSONB        NOT NULL,
  attempt         SMALLINT     NOT NULL DEFAULT 1,
  status_code     INTEGER,                 -- HTTP response code (NULL if no response)
  response_body   TEXT,                    -- first 500 chars of response
  success         BOOLEAN      NOT NULL DEFAULT FALSE,
  error_message   TEXT,
  dispatched_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_id ON webhook_deliveries (endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_success     ON webhook_deliveries (success, dispatched_at DESC);
