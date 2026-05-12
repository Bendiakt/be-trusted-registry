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

const query = async (text, params = []) => {
  const start = Date.now()
  try {
    const result = await getPool().query(text, params)
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

    // ── Text-search indexes (GIN trigram for ILIKE) ──────────────────────────
    // Enable pg_trgm if not already available (safe on Railway PostgreSQL)
    await query("CREATE EXTENSION IF NOT EXISTS pg_trgm").catch(() => {/* may need superuser on some hosts */})
    await query("CREATE INDEX IF NOT EXISTS idx_companies_name_trgm     ON companies USING gin (company_name gin_trgm_ops)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_companies_sector_trgm   ON companies USING gin (sector gin_trgm_ops)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_companies_country_trgm  ON companies USING gin (country gin_trgm_ops)").catch(() => {})
    await query("CREATE INDEX IF NOT EXISTS idx_users_email_trgm        ON users     USING gin (email gin_trgm_ops)").catch(() => {})
}

module.exports = {
  getPool,
  query,
  initDb,
}
