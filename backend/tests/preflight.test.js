/**
 * preflight.test.js — integration tests for scripts/preflight-env.js
 *
 * Spawns the preflight script with controlled environments and asserts the
 * exit code + key output lines. No real secrets — dummy values exercise the
 * presence/format rules only.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')

const SCRIPT = path.join(__dirname, '..', 'scripts', 'preflight-env.js')
const HEX64 = '0'.repeat(64)
const LONG = 'a'.repeat(40)
const LONG2 = 'b'.repeat(40)

/** Run the script with a clean env (no .env inheritance via override keys). */
function run(extraEnv) {
  // Start from a minimal env so the developer's local .env-loaded process.env
  // doesn't leak in. dotenv only fills *unset* keys, and there's no .env in CI.
  const res = spawnSync(process.execPath, [SCRIPT], {
    // Run from a dir with no .env so dotenv can't backfill deleted keys from
    // the developer's local .env — keeps these tests hermetic in dev and CI.
    cwd: os.tmpdir(),
    env: { PATH: process.env.PATH, ...extraEnv },
    encoding: 'utf8',
  })
  return { code: res.status, out: (res.stdout || '') + (res.stderr || '') }
}

const PROD_OK = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://x',
  JWT_SECRET: LONG,
  JWT_REFRESH_SECRET: LONG2,
  ENCRYPTION_KEY: HEX64,
  STRIPE_SECRET_KEY: 'sk_live_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  RESEND_API_KEY: 're_dummy',
  RESEND_FROM: 'MyDD <x@mydd.work>',
  FRONTEND_URL: 'https://mydd.work',
  CORS_ORIGINS: 'https://mydd.work',
}

test('prod with all critical vars valid → exit 0', () => {
  const { code, out } = run(PROD_OK)
  assert.equal(code, 0, out)
  assert.match(out, /All critical checks passed/)
})

test('prod with TEST stripe key → exit 1 and flagged', () => {
  const { code, out } = run({ ...PROD_OK, STRIPE_SECRET_KEY: 'sk_test_dummy' })
  assert.equal(code, 1)
  assert.match(out, /TEST key in production/)
})

test('prod with localhost FRONTEND_URL → exit 1', () => {
  const { code, out } = run({ ...PROD_OK, FRONTEND_URL: 'http://localhost:5173' })
  assert.equal(code, 1)
  assert.match(out, /must be https and not localhost/)
})

test('prod with short JWT_SECRET → exit 1', () => {
  const { code } = run({ ...PROD_OK, JWT_SECRET: 'tooshort', JWT_REFRESH_SECRET: 'tooshort2' })
  assert.equal(code, 1)
})

test('prod with non-hex ENCRYPTION_KEY → exit 1', () => {
  const { code } = run({ ...PROD_OK, ENCRYPTION_KEY: 'nothex' })
  assert.equal(code, 1)
})

test('prod with JWT_REFRESH_SECRET equal to JWT_SECRET → exit 1', () => {
  const { code, out } = run({ ...PROD_OK, JWT_REFRESH_SECRET: LONG })
  assert.equal(code, 1)
  assert.match(out, /MUST differ from JWT_SECRET/)
})

test('prod with SMOKE_TEST_SKIP_EMAIL_VERIFY=true → exit 1', () => {
  const { code, out } = run({ ...PROD_OK, SMOKE_TEST_SKIP_EMAIL_VERIFY: 'true' })
  assert.equal(code, 1)
  assert.match(out, /MUST NOT be true in production/)
})

test('dev mode tolerates test stripe key and localhost → exit 0', () => {
  const { code } = run({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://x',
    JWT_SECRET: LONG,
    ENCRYPTION_KEY: HEX64,
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    FRONTEND_URL: 'http://localhost:5173',
  })
  assert.equal(code, 0)
})

test('missing DATABASE_URL is critical → exit 1', () => {
  const env = { ...PROD_OK }
  delete env.DATABASE_URL
  const { code, out } = run(env)
  assert.equal(code, 1)
  assert.match(out, /DATABASE_URL/)
})
