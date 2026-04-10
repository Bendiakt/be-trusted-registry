#!/usr/bin/env node
const { query, getPool } = require('../backend/db')

async function main() {
  try {
    const ping = await query('SELECT NOW() AS now, current_database() AS db')
    const users = await query('SELECT COUNT(*)::int AS count FROM users')
    const companies = await query('SELECT COUNT(*)::int AS count FROM companies')
    const missions = await query('SELECT COUNT(*)::int AS count FROM missions')

    console.log('PASS: PostgreSQL reachable')
    console.log(`db=${ping.rows[0].db}`)
    console.log(`now=${ping.rows[0].now.toISOString()}`)
    console.log(`users=${users.rows[0].count}`)
    console.log(`companies=${companies.rows[0].count}`)
    console.log(`missions=${missions.rows[0].count}`)
  } finally {
    const pool = getPool()
    await pool.end()
  }
}

main().catch((err) => {
  if (String(err.message || '').includes('postgres.railway.internal') || err.code === 'ENOTFOUND') {
    console.error('FAIL: cannot resolve Railway private DB hostname from this network')
    console.error('Hint: run this check from Railway runtime or use a public DB connection URL')
    process.exit(1)
  }
  console.error('FAIL:', err.message)
  process.exit(1)
})
