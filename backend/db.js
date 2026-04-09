const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL

const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)

let pool = null

const getPool = () => {
  if (pool) return pool
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL. Configure PostgreSQL before starting the backend.')
  }
  pool = new Pool({
    connectionString,
    ssl: isRailway ? { rejectUnauthorized: false } : false,
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
}

module.exports = {
  getPool,
  query,
  initDb,
}
