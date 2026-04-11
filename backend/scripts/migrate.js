'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const fs = require('fs')
const path = require('path')
const { getPool } = require('../db')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

const getAppliedVersions = async (client) => {
  const res = await client.query('SELECT version FROM schema_migrations')
  return new Set(res.rows.map((r) => r.version))
}

const applyMigration = async (client, fileName, sql) => {
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [fileName])
    await client.query('COMMIT')
    console.log(`Applied migration: ${fileName}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}

const run = async () => {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await ensureMigrationsTable(client)
    const applied = await getAppliedVersions(client)

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skip already applied: ${file}`)
        continue
      }
      const filePath = path.join(MIGRATIONS_DIR, file)
      const sql = fs.readFileSync(filePath, 'utf8')
      await applyMigration(client, file, sql)
    }

    console.log('Migrations complete')
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
