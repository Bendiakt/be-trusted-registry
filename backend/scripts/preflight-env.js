#!/usr/bin/env node
/**
 * preflight-env.js — Go-live environment preflight check.
 *
 * Verifies that the environment is correctly configured BEFORE opening the
 * platform to paying customers. Checks PRESENCE and FORMAT of each variable —
 * it NEVER prints a secret value, only its name + a pass/fail/format verdict.
 *
 * Usage:
 *   node scripts/preflight-env.js            # checks current process env (+ .env via dotenv)
 *   NODE_ENV=production node scripts/preflight-env.js
 *
 * Exit codes:
 *   0  all critical checks passed (warnings allowed)
 *   1  one or more critical checks failed
 *
 * In production mode (NODE_ENV=production) the rules are stricter:
 *   - Stripe key must be LIVE (sk_live_), not test
 *   - URLs must be https and point to the prod domain (not localhost)
 *   - SMOKE_TEST_SKIP_EMAIL_VERIFY must be off
 */
'use strict'

try { require('dotenv').config() } catch { /* dotenv optional — Railway injects real env */ }

const isProd = process.env.NODE_ENV === 'production'
const results = [] // { level: 'critical'|'warn'|'info', name, ok, detail }

const env = (k) => process.env[k]
const present = (k) => typeof env(k) === 'string' && env(k).trim() !== ''

/** Record a check. `ok===null` means "skipped/not-applicable". */
function check(level, name, ok, detail) {
  results.push({ level, name, ok, detail })
}

// ── Critical: must be present, any environment ───────────────────────────────
check('critical', 'DATABASE_URL', present('DATABASE_URL'), 'PostgreSQL connection string')

const jwt = env('JWT_SECRET') || ''
check('critical', 'JWT_SECRET',
  present('JWT_SECRET') && jwt.length >= 32,
  present('JWT_SECRET') ? `length ${jwt.length} (need ≥ 32)` : 'missing')

const refresh = env('JWT_REFRESH_SECRET') || ''
if (present('JWT_REFRESH_SECRET')) {
  check('critical', 'JWT_REFRESH_SECRET',
    refresh.length >= 32 && refresh !== jwt,
    refresh === jwt ? 'MUST differ from JWT_SECRET' : `length ${refresh.length} (need ≥ 32)`)
} else {
  // Code falls back to JWT_SECRET, but for prod a distinct secret is expected.
  check(isProd ? 'critical' : 'warn', 'JWT_REFRESH_SECRET', false,
    'unset — falls back to JWT_SECRET (set a distinct secret for prod)')
}

const encKey = env('ENCRYPTION_KEY') || ''
check('critical', 'ENCRYPTION_KEY',
  /^[0-9a-fA-F]{64}$/.test(encKey),
  present('ENCRYPTION_KEY') ? 'must be 64 hex chars (32 bytes)' : 'missing')

// ── Critical in prod: Stripe ─────────────────────────────────────────────────
const sk = env('STRIPE_SECRET_KEY') || ''
if (present('STRIPE_SECRET_KEY')) {
  const live = sk.startsWith('sk_live_')
  const test = sk.startsWith('sk_test_')
  check(isProd ? 'critical' : 'info', 'STRIPE_SECRET_KEY',
    isProd ? live : (live || test),
    live ? 'LIVE mode' : test ? (isProd ? 'TEST key in production!' : 'test mode') : 'unrecognized prefix')
} else {
  check(isProd ? 'critical' : 'warn', 'STRIPE_SECRET_KEY', false, 'missing — payments disabled')
}

const whsec = env('STRIPE_WEBHOOK_SECRET') || ''
check(isProd ? 'critical' : 'warn', 'STRIPE_WEBHOOK_SECRET',
  whsec.startsWith('whsec_'),
  present('STRIPE_WEBHOOK_SECRET') ? 'must start with whsec_' : 'missing — webhook signature checks will fail')

// PAC subscription price IDs (only the dynamic-priced flows work without them)
for (const tier of ['STRIPE_PAC_S2_PRICE_ID', 'STRIPE_PAC_S3_PRICE_ID']) {
  check(isProd ? 'warn' : 'info', tier,
    env(tier) ? env(tier).startsWith('price_') : false,
    present(tier) ? null : 'unset — PAC subscription checkout for this tier unavailable')
}

// ── Critical in prod: email ──────────────────────────────────────────────────
check(isProd ? 'critical' : 'warn', 'RESEND_API_KEY',
  (env('RESEND_API_KEY') || '').startsWith('re_'),
  present('RESEND_API_KEY') ? 'must start with re_' : 'missing — emails only logged, not sent')
check(isProd ? 'critical' : 'warn', 'RESEND_FROM',
  present('RESEND_FROM'), 'sender identity (verified domain)')

// ── URLs / CORS ──────────────────────────────────────────────────────────────
function urlCheck(name, level) {
  if (!present(name)) return check(level, name, false, 'missing')
  const v = env(name)
  if (isProd) {
    const ok = /^https:\/\//.test(v) && !/localhost|127\.0\.0\.1/.test(v)
    return check(level, name, ok, ok ? 'https prod URL' : 'must be https and not localhost in prod')
  }
  return check('info', name, true, 'set')
}
urlCheck('FRONTEND_URL', isProd ? 'critical' : 'warn')
urlCheck('CORS_ORIGINS', isProd ? 'critical' : 'warn')

// ── Observability / ops (recommended) ────────────────────────────────────────
check('warn', 'SENTRY_DSN', present('SENTRY_DSN'), 'error tracking (recommended for prod)')
check('warn', 'REDIS_URL', present('REDIS_URL'), 'distributed rate-limit / cache (recommended)')
check('warn', 'METRICS_TOKEN',
  present('METRICS_TOKEN') || present('METRICS_SECRET'),
  '/metrics endpoint guard — leaving it open exposes business metrics')

// ── Safety: dangerous flags must be off in prod ──────────────────────────────
if (isProd) {
  check('critical', 'SMOKE_TEST_SKIP_EMAIL_VERIFY',
    env('SMOKE_TEST_SKIP_EMAIL_VERIFY') !== 'true',
    env('SMOKE_TEST_SKIP_EMAIL_VERIFY') === 'true' ? 'MUST NOT be true in production' : 'off')
}
check(isProd ? 'critical' : 'info', 'NODE_ENV',
  isProd ? true : true,
  `${env('NODE_ENV') || 'unset'}`)

// ── Report ───────────────────────────────────────────────────────────────────
const icon = (r) => r.ok === null ? '·' : r.ok ? '✅' : (r.level === 'critical' ? '❌' : '⚠️ ')
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n)

console.log(`\nMyDD — Go-live env preflight  (NODE_ENV=${env('NODE_ENV') || 'unset'}${isProd ? ', PROD rules' : ''})\n`)
for (const r of results) {
  const tag = r.level === 'critical' ? 'CRIT' : r.level === 'warn' ? 'WARN' : 'info'
  // Show detail on failures, on skipped, and on info rows (context); hide the
  // requirement hint when a critical/warn check already passed.
  const showDetail = r.ok === false || r.ok === null || r.level === 'info'
  console.log(`  ${icon(r)} [${tag}] ${pad(r.name, 28)} ${showDetail ? (r.detail || '') : ''}`)
}

const failedCritical = results.filter((r) => r.level === 'critical' && r.ok === false)
const failedWarn = results.filter((r) => r.level === 'warn' && r.ok === false)

console.log('')
console.log(`  critical failures : ${failedCritical.length}`)
console.log(`  warnings          : ${failedWarn.length}`)

if (failedCritical.length) {
  console.log(`\n❌ NOT go-live ready — fix the ${failedCritical.length} critical item(s) above.\n`)
  process.exit(1)
}
console.log(`\n✅ All critical checks passed${failedWarn.length ? ` (${failedWarn.length} warning(s) to review)` : ''}.\n`)
process.exit(0)
