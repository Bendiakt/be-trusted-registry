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

// ── Process health ─────────────────────────────────────────────────────────────
router.get('/api/health', (req, res) => {
  const mem = process.memoryUsage()
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    memory: {
      rss:       mem.rss,
      heapUsed:  mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    node: process.version,
    env:  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown',
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
  let dbOk       = false
  let dbLatencyMs = null
  try {
    const t0 = Date.now()
    await query('SELECT 1')
    dbLatencyMs = Date.now() - t0
    dbOk        = true
  } catch (_) { /* db unreachable */ }

  const uptimeSec    = Math.floor(process.uptime())
  const overallStatus = dbOk ? 'Operational' : 'Degraded'
  const statusColor  = dbOk ? '#22c55e' : '#ef4444'

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MyDD — Status</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#111}
    h1{font-size:1.5rem;font-weight:700}
    .badge{display:inline-block;padding:4px 12px;border-radius:999px;color:#fff;font-weight:600;background:${statusColor}}
    table{border-collapse:collapse;width:100%;margin-top:24px}
    td,th{text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb}
    th{font-weight:600;background:#f9fafb}
    .ok{color:#16a34a;font-weight:600}
    .fail{color:#dc2626;font-weight:600}
    footer{margin-top:32px;font-size:.85rem;color:#6b7280}
  </style>
</head>
<body>
  <h1>MyDD</h1>
  <p>Overall status: <span class="badge">${overallStatus}</span></p>
  <table>
    <tr><th>Component</th><th>Status</th><th>Detail</th></tr>
    <tr>
      <td>API process</td>
      <td class="ok">Operational</td>
      <td>uptime ${uptimeSec}s</td>
    </tr>
    <tr>
      <td>Database</td>
      <td class="${dbOk ? 'ok' : 'fail'}">${dbOk ? 'Operational' : 'Unreachable'}</td>
      <td>${dbOk ? `latency ${dbLatencyMs}ms` : 'Connection failed'}</td>
    </tr>
  </table>
  <footer>Generated ${new Date().toISOString()} &bull; Node ${process.version}</footer>
</body>
</html>`)
})

module.exports = router
