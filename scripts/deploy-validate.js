#!/usr/bin/env node
'use strict'
/**
 * scripts/deploy-validate.js — Orchestrateur de validation post-déploiement.
 *
 * Enchaîne tous les checks de déploiement dans l'ordre et produit
 * un rapport synthétique pass/fail avec le temps d'exécution.
 *
 * Usage :
 *   node scripts/deploy-validate.js [--env prod|staging]
 *   node scripts/deploy-validate.js --env staging --skip-dns --skip-stripe
 *
 * Options :
 *   --env prod|staging   Environnement cible (défaut: prod)
 *   --skip-dns           Ne pas vérifier les DNS
 *   --skip-stripe        Ne pas vérifier Stripe (requiert STRIPE_SECRET_KEY)
 *   --skip-email         Ne pas envoyer l'email de test (requiert RESEND_API_KEY + --to)
 *   --to email@x.com     Destinataire du test email
 */

const { spawnSync } = require('child_process')
const path = require('path')

const ROOT    = path.join(__dirname, '..')
const args    = process.argv.slice(2)
const ENV     = args.includes('--env') ? args[args.indexOf('--env') + 1] : 'prod'
const TO      = args.includes('--to')  ? args[args.indexOf('--to')  + 1] : null
const skipDns    = args.includes('--skip-dns')
const skipStripe = args.includes('--skip-stripe')
const skipEmail  = args.includes('--skip-email')

const run = (label, cmd, cmdArgs, env = {}) => {
  const start = Date.now()
  const result = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'pipe',
    encoding: 'utf8',
  })
  const durationMs = Date.now() - start
  const ok = result.status === 0
  return { label, ok, durationMs, stdout: result.stdout, stderr: result.stderr }
}

const checks = []

;(async () => {
  const start = Date.now()
  console.log(`\nMyDD Deploy Validation — ${ENV.toUpperCase()}\n` + '═'.repeat(60))

  // 1. DNS
  if (!skipDns) {
    console.log('\n[1/5] DNS records...')
    const r = run('DNS', 'node', ['scripts/verify-dns.js'])
    checks.push(r)
    console.log(r.stdout.trim())
  } else {
    console.log('\n[1/5] DNS — skipped')
  }

  // 2. Service health
  console.log('\n[2/5] Service health...')
  const healthArgs = ['scripts/verify-health.js', '--env', ENV]
  const rHealth = run('Health', 'node', healthArgs)
  checks.push(rHealth)
  console.log(rHealth.stdout.trim())
  if (!rHealth.ok && rHealth.stderr) console.log(rHealth.stderr.trim())

  // 3. Stripe
  if (!skipStripe && process.env.STRIPE_SECRET_KEY) {
    console.log('\n[3/5] Stripe configuration...')
    const rStripe = run('Stripe', 'node', ['scripts/verify-stripe.js'])
    checks.push(rStripe)
    console.log(rStripe.stdout.trim())
  } else if (skipStripe) {
    console.log('\n[3/5] Stripe — skipped')
  } else {
    console.log('\n[3/5] Stripe — skipped (set STRIPE_SECRET_KEY to enable)')
  }

  // 4. Email
  if (!skipEmail && process.env.RESEND_API_KEY && TO) {
    console.log('\n[4/5] Email delivery...')
    const rEmail = run('Email', 'node', ['scripts/verify-email.js', '--to', TO])
    checks.push(rEmail)
    console.log(rEmail.stdout.trim())
  } else {
    console.log('\n[4/5] Email — skipped (set RESEND_API_KEY + --to email to enable)')
  }

  // 5. Load test (staging only to avoid prod load)
  const apiKey = process.env.MYDD_API_KEY
  if (apiKey && ENV === 'staging') {
    console.log('\n[5/5] Load test...')
    const loadEnv = {
      MYDD_BASE_URL:    ENV === 'staging' ? 'https://staging-api.mydd.work' : 'https://api.mydd.work',
      MYDD_API_KEY:     apiKey,
      LOAD_DURATION_S:  '15',
      LOAD_CONNECTIONS: '5',
    }
    const rLoad = run('Load test', 'node', ['backend/tests/load/run.js'], loadEnv)
    checks.push(rLoad)
    console.log(rLoad.stdout.trim())
  } else {
    console.log('\n[5/5] Load test — skipped (set MYDD_API_KEY + --env staging to enable)')
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalMs = Date.now() - start
  const passed  = checks.filter(c => c.ok).length
  const failed  = checks.filter(c => !c.ok)

  console.log('\n' + '═'.repeat(60))
  console.log(`RESULTS — ${passed}/${checks.length} checks passed (${(totalMs / 1000).toFixed(1)}s)`)
  console.log('═'.repeat(60))

  checks.forEach(c => {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.label.padEnd(20)} ${c.durationMs}ms`)
  })

  if (failed.length) {
    console.log(`\nFAILED: ${failed.map(c => c.label).join(', ')}`)
    console.log('Resolve the above before considering the deployment complete.\n')
    process.exit(1)
  } else {
    console.log('\nAll checks passed — deployment validated.\n')
    process.exit(0)
  }
})()
