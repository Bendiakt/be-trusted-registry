const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL

const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)

let pool = null

const getPool = () => {
  if (pool) return pool
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL. Configure PostgreSQL before starting the backend.')
  }
  const poolMax = parseInt(process.env.PG_POOL_MAX || '20', 10)
  const poolMin = parseInt(process.env.PG_POOL_MIN || '2', 10)
  const idleTimeoutMillis = parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10)
  const connectionTimeoutMillis = parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '3000', 10)
  const statementTimeout = parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '30000', 10)

  pool = new Pool({
    connectionString,
    ssl: isRailway ? { rejectUnauthorized: false } : false,
    max: Number.isNaN(poolMax) ? 20 : poolMax,
    min: Number.isNaN(poolMin) ? 2 : poolMin,
    idleTimeoutMillis: Number.isNaN(idleTimeoutMillis) ? 30000 : idleTimeoutMillis,
    connectionTimeoutMillis: Number.isNaN(connectionTimeoutMillis) ? 3000 : connectionTimeoutMillis,
    statement_timeout: Number.isNaN(statementTimeout) ? 30000 : statementTimeout,
  })
  return pool
}

// Slow-query threshold (ms). Queries exceeding this emit a structured warning.
const SLOW_QUERY_WARN_MS = parseInt(process.env.SLOW_QUERY_WARN_MS || '1000', 10)

// Circuit-breaker: reject with 503 when the pool is overwhelmed.
// Prevents request pile-up that starves all workers under sudden traffic spikes.
const POOL_CIRCUIT_THRESHOLD = parseInt(process.env.PG_CIRCUIT_THRESHOLD || '5', 10)

const query = async (text, params = []) => {
  const p = getPool()

  // Check pool saturation before acquiring a connection
  if (p.waitingCount > POOL_CIRCUIT_THRESHOLD) {
    const err = new Error('Database pool saturated — circuit breaker open')
    err.status = 503
    err.code    = 'POOL_SATURATED'
    console.error(JSON.stringify({
      event:        'pool_circuit_open',
      waitingCount: p.waitingCount,
      totalCount:   p.totalCount,
      idleCount:    p.idleCount,
      threshold:    POOL_CIRCUIT_THRESHOLD,
    }))
    throw err
  }

  const start = Date.now()
  try {
    const result = await p.query(text, params)
    const durationMs = Date.now() - start
    if (durationMs > SLOW_QUERY_WARN_MS) {
      // Truncate query text to avoid logging PII — first 120 chars only
      const preview = typeof text === 'string' ? text.replace(/\s+/g, ' ').slice(0, 120) : '(object)'
      console.warn(JSON.stringify({
        event: 'slow_query',
        durationMs,
        thresholdMs: SLOW_QUERY_WARN_MS,
        query: preview,
      }))
    }
    return result
  } catch (err) {
    const durationMs = Date.now() - start
    console.error(JSON.stringify({
      event: 'query_error',
      durationMs,
      code: err.code,
      message: err.message,
    }))
    throw err
  }
}

// Log pool health every 5 minutes — detects connection exhaustion early.
setInterval(() => {
  if (!pool) return
  const { totalCount, idleCount, waitingCount } = pool
  if (waitingCount > 0 || totalCount >= (parseInt(process.env.PG_POOL_MAX || '20', 10) * 0.8)) {
    console.warn(JSON.stringify({
      event: 'pool_health',
      totalCount,
      idleCount,
      waitingCount,
    }))
  }
}, 5 * 60 * 1000)

// ── Expired token cleanup ─────────────────────────────────────────────────────
// Runs once at startup (after a short delay) then every 6 hours.
// Keeps token_blacklist and refresh_tokens tables lean — prevents degradation
// on auth checks as rows accumulate over weeks/months.
const runTokenCleanup = async () => {
  try {
    const [bl, rt] = await Promise.all([
      query("DELETE FROM token_blacklist   WHERE expires_at < NOW()"),
      query("DELETE FROM refresh_tokens    WHERE expires_at < NOW() OR revoked_at IS NOT NULL"),
    ])
    const blCount = bl.rowCount ?? 0
    const rtCount = rt.rowCount ?? 0
    if (blCount > 0 || rtCount > 0) {
      console.log(JSON.stringify({
        event: 'token_cleanup',
        blacklist_deleted: blCount,
        refresh_deleted: rtCount,
      }))
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'token_cleanup_error', message: err.message }))
  }
}

// Delay startup run by 30 s so the pool is fully initialised before we query.
const _cleanupStartTimer = setTimeout(runTokenCleanup, 30 * 1000)
if (typeof _cleanupStartTimer.unref === 'function') _cleanupStartTimer.unref()

const _cleanupInterval = setInterval(runTokenCleanup, 6 * 60 * 60 * 1000)
if (typeof _cleanupInterval.unref === 'function') _cleanupInterval.unref()

const initDb = async () => {
  // Core tables used by auth, company registry, and PAC workflow.
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'company',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT,
      company_name TEXT,
      industry TEXT,
      sector TEXT,
      country TEXT,
      description TEXT,
      website TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      certification_level INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'available',
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      company_name TEXT,
      location TEXT,
      type TEXT,
      description TEXT,
      fee_usd INTEGER NOT NULL DEFAULT 500,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS company_name TEXT")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS location     TEXT")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS type         TEXT")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS description  TEXT")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS fee_usd      INTEGER NOT NULL DEFAULT 500")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS report_text  TEXT")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS outcome      TEXT")
  await query("ALTER TABLE missions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ")
  await query("CREATE INDEX IF NOT EXISTS idx_missions_status      ON missions(status)")
  await query("CREATE INDEX IF NOT EXISTS idx_missions_assigned_to ON missions(assigned_to) WHERE assigned_to IS NOT NULL")

  await query(`
    CREATE TABLE IF NOT EXISTS pac_profiles (
      id             SERIAL      PRIMARY KEY,
      user_id        INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      full_name      TEXT,
      location       TEXT,
      languages      TEXT,
      certifications TEXT,
      bio            TEXT,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query('ALTER TABLE users     ADD COLUMN IF NOT EXISTS last_login  TIMESTAMPTZ')
  await query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ')
    await query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        resource TEXT,
        ip_address TEXT,
        payload_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS trust_scores (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        score INTEGER NOT NULL DEFAULT 0,
        risk_level TEXT NOT NULL DEFAULT 'unknown',
        indicators JSONB,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS fraud_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        rule TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'low',
        resolved BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS metrics_snapshot (
        id SERIAL PRIMARY KEY,
        users_count INTEGER DEFAULT 0,
        companies_count INTEGER DEFAULT 0,
        certified_count INTEGER DEFAULT 0,
        fraud_alerts_count INTEGER DEFAULT 0,
        avg_trust_score NUMERIC(5,2) DEFAULT 0,
        revenue_total NUMERIC(12,2) DEFAULT 0,
        snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Indexes for frequent metrics aggregations and latest snapshot lookup.
    await query('CREATE INDEX IF NOT EXISTS idx_companies_certification_level ON companies(certification_level)')
    await query('CREATE INDEX IF NOT EXISTS idx_fraud_alerts_resolved ON fraud_alerts(resolved)')
    await query('CREATE INDEX IF NOT EXISTS idx_trust_scores_computed_at ON trust_scores(computed_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_id_desc ON metrics_snapshot(id DESC)')

    await query(`
      CREATE TABLE IF NOT EXISTS token_blacklist (
        id SERIAL PRIMARY KEY,
        jti TEXT NOT NULL UNIQUE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    // Backfill unique constraint if table pre-existed without it
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'refresh_tokens_token_hash_key'
            AND conrelid = 'refresh_tokens'::regclass
        ) THEN
          ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);
        END IF;
      END $$
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        stripe_session_id TEXT UNIQUE,
        stripe_payment_intent_id TEXT,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'usd',
        plan_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        certification_id INTEGER REFERENCES certifications(id) ON DELETE SET NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'")
    await query('CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent ON payments(stripe_payment_intent_id)')

    await query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        level INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        granted_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query('ALTER TABLE certifications ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ')
    await query('ALTER TABLE certifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ')

    await query(`
      CREATE OR REPLACE VIEW revenue_stats AS
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE status = 'completed'), 0) AS revenue_total_cents,
        ROUND(COALESCE(SUM(amount_cents) FILTER (WHERE status = 'completed'), 0)::numeric / 100, 2) AS revenue_total_usd,
        COUNT(*) FILTER (WHERE status = 'completed')  AS payments_completed,
        COUNT(*) FILTER (WHERE status = 'pending')    AS payments_pending,
        COUNT(*) FILTER (WHERE status = 'failed')     AS payments_failed,
        COUNT(*) FILTER (WHERE status = 'refunded')   AS payments_refunded,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status = 'completed') AS payments_last_30d,
        ROUND(COALESCE(SUM(amount_cents) FILTER (
          WHERE created_at > NOW() - INTERVAL '30 days' AND status = 'completed'
        ), 0)::numeric / 100, 2) AS revenue_last_30d_usd
      FROM payments
    `)

    await query('CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(jti)')
    await query('CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at)')
    await query('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens(user_id, revoked_at, expires_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_payments_company_created ON payments(company_id, created_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at DESC)')

    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         SERIAL      PRIMARY KEY,
        user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT        NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query('CREATE INDEX IF NOT EXISTS idx_prt_hash    ON password_reset_tokens(token_hash)')
    await query('CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at)')

    // ── Columns added post-launch (previously only in PROD_SETUP.sql) ──────────
    // These are idempotent — safe to run on every boot against any DB state.
    await query("ALTER TABLE users         ADD COLUMN IF NOT EXISTS email_verified       BOOLEAN     NOT NULL DEFAULT FALSE")
    await query("ALTER TABLE users         ADD COLUMN IF NOT EXISTS email_verify_token   TEXT")
    await query("ALTER TABLE users         ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ")
    await query("ALTER TABLE companies     ADD COLUMN IF NOT EXISTS stripe_customer_id   TEXT")
    await query("ALTER TABLE companies     ADD COLUMN IF NOT EXISTS suspended_at         TIMESTAMPTZ")
    await query("ALTER TABLE companies     ADD COLUMN IF NOT EXISTS suspended_reason      TEXT")
    await query("ALTER TABLE certifications ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ")
    await query('CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer ON companies(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL')

    // ── Notifications ────────────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         SERIAL      PRIMARY KEY,
        user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT        NOT NULL,
        payload    JSONB       NOT NULL DEFAULT '{}',
        read_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query('CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON notifications (user_id, read_at) WHERE read_at IS NULL')

    // Partial index for fast certified-company lookups (Trader Portal / public registry)
    await query('CREATE INDEX IF NOT EXISTS idx_companies_certified_country ON companies(country, certification_level) WHERE certification_level > 0')
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'company'")

    // ── 2FA TOTP columns (admin accounts) ────────────────────────────────────
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret  TEXT")
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE")

    // Temp-token store: short-lived tokens issued after password check but before TOTP validation
    await query(`
      CREATE TABLE IF NOT EXISTS totp_pending (
        id         SERIAL      PRIMARY KEY,
        user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT        NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await query('CREATE INDEX IF NOT EXISTS idx_totp_pending_hash    ON totp_pending(token_hash)')
    await query('CREATE INDEX IF NOT EXISTS idx_totp_pending_expires ON totp_pending(expires_at)')

    // ── Text-search indexes (GIN trigram for ILIKE) ──────────────────────────
    // Enable pg_trgm if not already available (safe on Railway PostgreSQL)
    await query("CREATE EXTENSION IF NOT EXISTS pg_trgm").catch(() => {/* may need superuser on some hosts */})
    await query("CREATE INDEX IF NOT EXISTS idx_companies_name_trgm     ON companies USING gin (company_name gin_trgm_ops)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_companies_sector_trgm   ON companies USING gin (sector gin_trgm_ops)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_companies_country_trgm  ON companies USING gin (country gin_trgm_ops)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_users_email_trgm        ON users     USING gin (email gin_trgm_ops)").catch(() => {})

    // ── Migration 005: GDPR / ToS consent columns ─────────────────────────────
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_version     TEXT")
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ")
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ")
    await query("CREATE INDEX IF NOT EXISTS idx_audit_log_user_id       ON audit_log    (user_id)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications(user_id)").catch(() => {})

    // ── Migration 006: Performance indexes ───────────────────────────────────
    await query("CREATE INDEX IF NOT EXISTS idx_companies_user_id              ON companies    (user_id)           WHERE user_id    IS NOT NULL").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_certifications_status_expires  ON certifications(status, expires_at) WHERE expires_at IS NOT NULL").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_documents_user_status          ON documents    (user_id, status)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_audit_log_action               ON audit_log    (action)").catch(() => {})

    // ── Migration 007: API keys ───────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id            SERIAL       PRIMARY KEY,
        user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          TEXT         NOT NULL,
        prefix        TEXT         NOT NULL UNIQUE,
        hashed_key    TEXT         NOT NULL UNIQUE,
        scopes        JSONB        NOT NULL DEFAULT '["registry:read","verify:read"]',
        rate_limit    INTEGER      NOT NULL DEFAULT 60,
        last_used_at  TIMESTAMPTZ,
        expires_at    TIMESTAMPTZ,
        revoked       BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `)
    await query("CREATE INDEX IF NOT EXISTS idx_api_keys_user_id    ON api_keys (user_id)")
    await query("CREATE INDEX IF NOT EXISTS idx_api_keys_prefix     ON api_keys (prefix)")
    await query("CREATE INDEX IF NOT EXISTS idx_api_keys_hashed_key ON api_keys (hashed_key)")
    await query(`
      CREATE TABLE IF NOT EXISTS api_key_usage (
        id          SERIAL  PRIMARY KEY,
        api_key_id  INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        day         DATE    NOT NULL DEFAULT CURRENT_DATE,
        requests    INTEGER NOT NULL DEFAULT 0,
        UNIQUE (api_key_id, day)
      )
    `)
    await query("CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_day ON api_key_usage (api_key_id, day)")

    // ── Migration 008: Webhooks ───────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS webhook_endpoints (
        id          SERIAL       PRIMARY KEY,
        user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        url         TEXT         NOT NULL,
        secret      TEXT         NOT NULL,
        events      JSONB        NOT NULL DEFAULT '["cert.status_changed"]',
        active      BOOLEAN      NOT NULL DEFAULT TRUE,
        description TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `)
    await query("CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user_id ON webhook_endpoints (user_id)")
    await query("CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active  ON webhook_endpoints (active) WHERE active = TRUE")
    await query(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id              SERIAL       PRIMARY KEY,
        endpoint_id     INTEGER      NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
        event_type      TEXT         NOT NULL,
        payload         JSONB        NOT NULL,
        attempt         SMALLINT     NOT NULL DEFAULT 1,
        status_code     INTEGER,
        response_body   TEXT,
        success         BOOLEAN      NOT NULL DEFAULT FALSE,
        error_message   TEXT,
        dispatched_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `)
    await query("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_id ON webhook_deliveries (endpoint_id)")
    await query("CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_success     ON webhook_deliveries (success, dispatched_at DESC)")

    // ── Migration 009: Trader subscription (Stripe billing) ──────────────────
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT")
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT")
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status     TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('inactive','active','past_due','cancelled'))").catch(() => {
      // Column may already exist without constraint — add constraint separately
      return query("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive'")
    })
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan       TEXT").catch(() => {})
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ")
    await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer    ON users(stripe_customer_id)   WHERE stripe_customer_id  IS NOT NULL").catch(() => {})
    await query("CREATE INDEX        IF NOT EXISTS idx_users_subscription_status ON users(subscription_status) WHERE subscription_status IS NOT NULL").catch(() => {})
}

module.exports = {
  getPool,
  query,
  initDb,
}
