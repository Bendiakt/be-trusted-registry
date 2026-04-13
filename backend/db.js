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

const query = (text, params = []) => getPool().query(text, params)

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
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
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
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
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
        certification_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await query(`
      CREATE TABLE IF NOT EXISTS certifications (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        level INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await query(`
      CREATE OR REPLACE VIEW revenue_stats AS
      SELECT
        COALESCE(SUM(amount_cents), 0) AS revenue_total_cents,
        ROUND(COALESCE(SUM(amount_cents), 0)::numeric / 100, 2) AS revenue_total_usd,
        COUNT(*) AS payments_completed
      FROM payments
      WHERE status = 'completed'
    `)

    await query('CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(jti)')
    await query('CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at)')
    await query('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens(user_id, revoked_at, expires_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_payments_company_created ON payments(company_id, created_at DESC)')
    await query('CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments(status, created_at DESC)')
  }

module.exports = {
  getPool,
  query,
  initDb,
}
