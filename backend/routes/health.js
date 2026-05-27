'use strict'

/**
 * Health, liveness, readiness probes + public status page.
 *
 * GET /api/health        — basic process health (no DB check)
 * GET /api/health/live   — liveness probe (Railway/K8s: restart if this fails)
 * GET /api/health/ready  — readiness probe (Railway/K8s: remove from LB if this fails)
 * GET /status            — human-readable HTML status page
 */

const { Router } = require('express')
const { query }  = require('../db')

const router = Router()

// ── Config presence checks — fast, synchronous ───────────────────────────────
function configChecks() {
  return {
    stripe:  !!process.env.STRIPE_SECRET_KEY,
    resend:  !!process.env.RESEND_API_KEY,
    deepl:   !!process.env.DEEPL_API_KEY,
    redis:   !!process.env.REDIS_URL,
    sentry:  !!process.env.SENTRY_DSN,
  }
}

// ── Process health ─────────────────────────────────────────────────────────────
router.get('/api/health', (req, res) => {
  const mem    = process.memoryUsage()
  const config = configChecks()
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    memory: {
      rss:       mem.rss,
      heapUsed:  mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    node:   process.version,
    env:    process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown',
    config,
  })
})

// ── Liveness probe — process is running (never checks DB) ─────────────────────
router.get('/api/health/live', (req, res) => {
  res.json({ alive: true, uptimeSec: Math.floor(process.uptime()) })
})

// ── Readiness probe — DB must be reachable ─────────────────────────────────────
router.get('/api/health/ready', async (req, res) => {
  try {
    await query('SELECT 1')
    res.json({ ready: true, db: 'ok' })
  } catch (err) {
    console.error(JSON.stringify({ event: 'health.ready.db_unreachable', err: err.message }))
    res.status(503).json({ ready: false, db: 'unreachable', error: err.message })
  }
})

// ── Public status page — human-readable HTML ───────────────────────────────────
router.get('/status', async (req, res) => {
  let dbOk        = false
  let dbLatencyMs = null
  try {
    const t0 = Date.now()
    await query('SELECT 1')
    dbLatencyMs = Date.now() - t0
    dbOk        = true
  } catch (_) { /* db unreachable */ }

  const cfg          = configChecks()
  const uptimeSec    = Math.floor(process.uptime())
  const allOk        = dbOk && cfg.stripe && cfg.resend
  const overallStatus = allOk ? 'Operational' : dbOk ? 'Degraded' : 'Outage'
  const statusColor   = allOk ? '#22c55e' : dbOk ? '#f59e0b' : '#ef4444'

  const ok   = (label, detail = '') => `<tr><td>${label}</td><td class="ok">✓ Operational</td><td>${detail}</td></tr>`
  const warn  = (label, detail = '') => `<tr><td>${label}</td><td class="warn">⚠ Not configured</td><td>${detail}</td></tr>`
  const fail  = (label, detail = '') => `<tr><td>${label}</td><td class="fail">✗ Unreachable</td><td>${detail}</td></tr>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MyDD — Status</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;color:#111;background:#fafafa}
    h1{font-size:1.4rem;font-weight:800;margin:0 0 4px}
    .badge{display:inline-block;padding:4px 14px;border-radius:999px;color:#fff;font-weight:700;font-size:.85rem;background:${statusColor}}
    table{border-collapse:collapse;width:100%;margin-top:20px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
    td,th{text-align:left;padding:9px 14px;border-bottom:1px solid #f0f0f0;font-size:.9rem}
    th{font-weight:600;background:#f9fafb;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
    .ok{color:#16a34a;font-weight:600}
    .warn{color:#d97706;font-weight:600}
    .fail{color:#dc2626;font-weight:600}
    footer{margin-top:28px;font-size:.8rem;color:#9ca3af;text-align:center}
    h2{font-size:1rem;font-weight:700;margin:24px 0 0;color:#374151}
  </style>
</head>
<body>
  <h1>MyDD Platform Status</h1>
  <p style="color:#6b7280;font-size:.9rem;margin:4px 0 16px">
    Overall: <span class="badge">${overallStatus}</span>
    &nbsp; Uptime ${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m
    &nbsp; Node ${process.version}
    &nbsp; Env: ${process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown'}
  </p>

  <h2>Infrastructure</h2>
  <table>
    <tr><th>Component</th><th>Status</th><th>Detail</th></tr>
    <tr><td>API process</td><td class="ok">✓ Operational</td><td>uptime ${uptimeSec}s</td></tr>
    ${dbOk
      ? ok('PostgreSQL', `latency ${dbLatencyMs}ms`)
      : fail('PostgreSQL', 'Connection failed — check DATABASE_URL')}
    ${cfg.redis ? ok('Redis', 'rate limiting active') : warn('Redis', 'REDIS_URL not set — in-memory fallback')}
  </table>

  <h2>External services</h2>
  <table>
    <tr><th>Service</th><th>Status</th><th>Detail</th></tr>
    ${cfg.stripe ? ok('Stripe', 'payments enabled') : warn('Stripe', 'STRIPE_SECRET_KEY not set — payments disabled')}
    ${cfg.resend ? ok('Resend', 'transactional email active') : warn('Resend', 'RESEND_API_KEY not set — emails will be logged only')}
    ${cfg.deepl  ? ok('DeepL', 'translation proxy active') : warn('DeepL', 'DEEPL_API_KEY not set — /api/translate returns 503')}
    ${cfg.sentry ? ok('Sentry', 'error tracking active') : warn('Sentry', 'SENTRY_DSN not set — errors not tracked')}
  </table>

  <footer>Generated ${new Date().toISOString()} &bull; <a href="/api/health" style="color:#9ca3af">JSON health</a> &bull; <a href="/api/health/ready" style="color:#9ca3af">Readiness</a></footer>
</body>
</html>`)
})

module.exports = router
