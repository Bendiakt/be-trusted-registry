#!/usr/bin/env node
/**
 * seed-staging.js — Idempotent staging data seeder
 *
 * Creates three well-known test accounts for manual QA on staging:
 *   admin@staging.mydd.work   / StagingAdmin2025!   (role: admin)
 *   company@staging.mydd.work / StagingCompany2025! (role: company, with company profile)
 *   pac@staging.mydd.work     / StagingPac2025!     (role: pac)
 *
 * All accounts have email_verified = TRUE so login works immediately.
 * Idempotent: safe to re-run at any time — uses ON CONFLICT DO NOTHING / DO UPDATE.
 *
 * Usage:
 *   railway run node scripts/seed-staging.js          (from /backend)
 *   DATABASE_URL=... node scripts/seed-staging.js     (local with explicit DB)
 *   npm run seed:staging                              (if added to package.json)
 *
 * Never run this against the production database.
 */

'use strict'

const bcrypt = require('bcryptjs')

// ── Guard: refuse to run if DATABASE_URL looks like production ─────────────
const dbUrl = process.env.DATABASE_URL || ''
if (!dbUrl) {
  console.error('FATAL: DATABASE_URL is not set.')
  process.exit(1)
}
// Production Railway service names contain "be-trusted-registry" or "production"
// in their connection strings. Staging uses a separate Railway project.
const PROD_SIGNALS = ['be-trusted-registry', 'mydd.work', 'production']
if (PROD_SIGNALS.some(s => dbUrl.includes(s))) {
  console.error('FATAL: DATABASE_URL looks like production. Refusing to seed.')
  console.error('  URL snippet:', dbUrl.slice(0, 60) + '...')
  process.exit(1)
}
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production') {
  console.error('FATAL: NODE_ENV / RAILWAY_ENVIRONMENT is "production". Refusing to seed.')
  process.exit(1)
}

// ── DB connection (mirrors db.js but self-contained) ──────────────────────
const { Pool } = require('pg')
const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isRailway ? { rejectUnauthorized: false } : false,
  max: 3,
})
const q = (text, params = []) => pool.query(text, params)

// ── Seed data ─────────────────────────────────────────────────────────────
const SALT_ROUNDS = 10
const TOS_VERSION = '2025-01'

const USERS = [
  {
    name:  'Staging Admin',
    email: 'admin@staging.mydd.work',
    pass:  'StagingAdmin2025!',
    role:  'admin',
    company: null,
  },
  {
    name:  'Staging Company',
    email: 'company@staging.mydd.work',
    pass:  'StagingCompany2025!',
    role:  'company',
    company: {
      company_name: 'MyDD Staging Co.',
      industry:     'Technology',
      sector:       'Software',
      country:      'FR',
      website:      'https://staging.mydd.work',
      status:       'active',
      certification_level: 1,
    },
  },
  {
    name:  'Staging PAC Agent',
    email: 'pac@staging.mydd.work',
    pass:  'StagingPac2025!',
    role:  'pac',
    company: null,
  },
]

// ── Main ──────────────────────────────────────────────────────────────────
async function seed () {
  console.log('🌱  Seeding staging database …\n')

  for (const u of USERS) {
    const hash = await bcrypt.hash(u.pass, SALT_ROUNDS)

    // Upsert user — update password/name on conflict so re-runs are safe
    const res = await q(
      `INSERT INTO users
         (name, email, password, role,
          email_verified, failed_login_attempts,
          tos_version, tos_accepted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4,
               TRUE, 0,
               $5, NOW(), NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
         SET password        = EXCLUDED.password,
             name            = EXCLUDED.name,
             email_verified  = TRUE,
             failed_login_attempts = 0,
             locked_until    = NULL,
             updated_at      = NOW()
       RETURNING id, email, role`,
      [u.name, u.email, hash, u.role, TOS_VERSION],
    )

    const user = res.rows[0]
    const tag  = res.rowCount > 0 && res.command === 'UPDATE' ? 'updated' : 'inserted'
    console.log(`  ✅  ${user.role.padEnd(7)}  ${user.email}  (id=${user.id}, ${tag})`)

    // Company profile for company-role users
    if (u.company) {
      const c = u.company
      await q(
        `INSERT INTO companies
           (user_id, name, company_name, industry, sector, country, website,
            status, certification_level, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET company_name        = EXCLUDED.company_name,
               industry            = EXCLUDED.industry,
               sector              = EXCLUDED.sector,
               country             = EXCLUDED.country,
               website             = EXCLUDED.website,
               status              = EXCLUDED.status,
               certification_level = EXCLUDED.certification_level,
               updated_at          = NOW()`,
        [
          user.id,
          c.company_name, c.company_name,
          c.industry, c.sector, c.country, c.website,
          c.status, c.certification_level,
        ],
      )
      console.log(`         ↳  company profile upserted (${c.company_name}, level ${c.certification_level})`)
    }
  }

  console.log('\n📋  Credentials summary:')
  console.log('  ┌────────────────────────────────────┬──────────────────────┬─────────┐')
  console.log('  │ Email                              │ Password             │ Role    │')
  console.log('  ├────────────────────────────────────┼──────────────────────┼─────────┤')
  for (const u of USERS) {
    const email = u.email.padEnd(34)
    const pass  = u.pass.padEnd(20)
    const role  = u.role.padEnd(7)
    console.log(`  │ ${email} │ ${pass} │ ${role} │`)
  }
  console.log('  └────────────────────────────────────┴──────────────────────┴─────────┘')

  console.log('\n✅  Seed complete.')
}

seed()
  .catch(err => {
    console.error('\n❌  Seed failed:', err.message)
    process.exit(1)
  })
  .finally(() => pool.end())
