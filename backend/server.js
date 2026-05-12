require('./instrument.js')
require('dotenv').config()
const express      = require('express')
const cors         = require('cors')
const cookieParser = require('cookie-parser')
const jwt          = require('jsonwebtoken')
const crypto       = require('crypto')
const http = require('http')
const { WebSocketServer } = require('ws')
// lib/encryption, fraudDetection, trustScore are used inside their respective route modules
const {
  auth,
  requireAdmin,
  publicReadLimiter,
  SECRET,
} = require('./lib/auth')
const { getRuntimeMetrics } = require('./lib/runtimeMetrics')
const metricsRouter = require('./routes/metrics')
const badgeRouter  = require('./routes/badge')
const { query, initDb } = require('./db')

// ── Sentry (optional — activates when SENTRY_DSN env var is set) ─────────────
let Sentry = null
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node')
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
    })
    console.log(JSON.stringify({ event: 'sentry.initialized', env: process.env.NODE_ENV || 'production' }))
  } catch (e) {
    console.warn('Sentry init failed (run npm install in backend):', e.message)
    Sentry = null
  }
}

const app = express()

const resolveAllowedOrigins = () => {
  const configured = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173'
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

const allowedOrigins = resolveAllowedOrigins()
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server and CLI calls without an Origin header.
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

// --- Metrics counters (initialised at startup) ---
const startTime = Date.now()
let requestCount = 0
let errorCount = 0
let totalLatency = 0

// ─── Correlation ID middleware ────────────────────────────────────────────────
// Attach a unique request ID to every request so all log lines for the same
// request can be correlated in Railway's log stream.
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || crypto.randomBytes(8).toString('hex')
  req.reqId = reqId
  res.setHeader('X-Request-ID', reqId)
  next()
})

// Middleware: track every request for metrics + structured logging.
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const durationMs = Date.now() - start
    requestCount++
    totalLatency += durationMs
    if (res.statusCode >= 400) errorCount++
    const entry = {
      ts: new Date().toISOString(),
      reqId: req.reqId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    }
    // Highlight slow requests inline
    if (durationMs > 3000) entry.slow = true
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
  })
  next()
})

// ─── Security headers (lightweight helmet-equivalent) ────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  // Content-Security-Policy — REST API: no document, deny all document-level directives
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; form-action 'none'"
  )
  // Remove server fingerprint
  res.removeHeader('X-Powered-By')
  next()
})

// ─── Health check aliases ─────────────────────────────────────────────────────
// /health  → bare alias (some Railway / LB configs probe root-level path)
// /api/health → full details (registered later with memory/DB info — see below)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  })
})

const jsonMiddleware = express.json({ limit: '2mb' })
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook' || req.originalUrl === '/api/stripe/webhook') return next()
  return jsonMiddleware(req, res, next)
})

// ── Cookie parser — required for httpOnly auth cookie strategy ────────────────
app.use(cookieParser())

// ── CSRF protection — double-submit cookie pattern ────────────────────────────
// Works with SameSite=Strict cookies for web; skipped for Bearer-token API calls.
// The frontend reads the non-httpOnly `csrf_token` cookie and sends it as the
// X-CSRF-Token header. This middleware verifies they match.
// (We intentionally do NOT use `csurf` — deprecated by Express team, May 2025.)
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const CSRF_EXEMPT = ['/api/payments/webhook', '/api/stripe/webhook']

app.use((req, res, next) => {
  // Skip safe HTTP methods and Stripe webhooks
  if (CSRF_SAFE_METHODS.has(req.method) || CSRF_EXEMPT.includes(req.originalUrl)) return next()
  // Skip if the request uses Bearer token auth (API clients, mobile) — CSRF only
  // applies to cookie-based sessions where the browser auto-attaches credentials.
  if (req.headers.authorization?.startsWith('Bearer ')) return next()
  // If no CSRF cookie exists yet, generate and set one (first-visit)
  const cookieToken = req.cookies?.csrf_token
  const headerToken = req.headers['x-csrf-token']
  if (!cookieToken) {
    // Let the request through — frontend will pick up the cookie on next call
    const newToken = crypto.randomBytes(32).toString('hex')
    res.cookie('csrf_token', newToken, { sameSite: 'strict', secure: process.env.NODE_ENV === 'production' })
    return next()
  }
  // Verify double-submit: cookie must match header
  if (!headerToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: 'CSRF token mismatch' })
  }
  return next()
})

// auth, requireAdmin, publicReadLimiter and SECRET are imported from lib/auth above.
// ── Required environment variables ───────────────────────────────────────────
// Fail fast at startup rather than crashing in the middle of a request.
;(function validateEnv() {
  const REQUIRED = ['JWT_SECRET', 'DATABASE_URL']
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  // Warn about important-but-optional vars that degrade functionality
  const RECOMMENDED = ['JWT_REFRESH_SECRET', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'FRONTEND_URL', 'SENTRY_DSN']
  const absent = RECOMMENDED.filter((k) => !process.env[k])
  if (absent.length) {
    console.warn(JSON.stringify({ event: 'env_warning', missing: absent, note: 'Some features may be degraded' }))
  }
})()

const mapCompanyRow = (row) => {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    companyName: row.company_name || row.name || '',
    industry: row.industry,
    sector: row.sector || row.industry || '',
    country: row.country,
    description: row.description,
    website: row.website,
    status: row.status,
    certificationLevel: row.certification_level || 0,
    level: row.certification_level || 0,
    badge: (row.certification_level || 0) > 0 ? 'certified' : 'not-certified',
    verifiedAt:      row.verified_at      || null,
    suspendedAt:     row.suspended_at     || null,
    suspendedReason: row.suspended_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const { router: paymentsRouter }  = require('./routes/payments')
const documentsRouter             = require('./routes/documents')
const traderRouter                = require('./routes/trader')
const authRouter                  = require('./routes/auth')
const adminRouter                 = require('./routes/admin')
const notificationsRouter         = require('./routes/notifications')
const companiesRouter             = require('./routes/companies')
const pacRouter                   = require('./routes/pac')
const { sendRenewalReminder, sendCertExpired } = require('./lib/mailer')

// ── Router mounts ─────────────────────────────────────────────────────────────
app.post('/api/payments/create-checkout-session', auth)
app.post('/api/payments/renewal-checkout',        auth)
app.post('/api/payments/portal',                  auth)
app.get('/api/payments/stats',                    auth)
app.post('/api/stripe/create-checkout-session',   auth)
app.post('/api/stripe/renewal-checkout',          auth)
app.post('/api/stripe/portal',                    auth)
app.get('/api/stripe/stats',                      auth)
app.use('/api/payments',       paymentsRouter)
app.use('/api/stripe',         paymentsRouter)
app.use('/api/metrics',        metricsRouter)
app.use('/api/badge',          badgeRouter)
app.use('/api/documents',      auth, documentsRouter)
app.use('/api/trader',         auth, traderRouter)
app.use('/api/auth',           authRouter)
app.use('/api/admin',          adminRouter)
app.use('/api/notifications',  notificationsRouter)
app.use('/api/companies',      companiesRouter)
app.use('/api/pac',            pacRouter)


app.get('/api/verify/:id', publicReadLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const result = await query('SELECT * FROM companies WHERE id = $1 LIMIT 1', [companyId])
    const company = mapCompanyRow(result.rows[0])
    if (!company) return res.status(404).json({ error: 'Company not found' })

    // Attach certInfo (expiry, days left) — same logic as /api/companies/me
    let certInfo = null
    const certResult = await query(
      `SELECT level, status, granted_at, expires_at
       FROM certifications
       WHERE company_id = $1 AND status IN ('active', 'submitted')
       ORDER BY level DESC, id DESC LIMIT 1`,
      [companyId]
    )
    if (certResult.rows.length > 0) {
      const c = certResult.rows[0]
      const expiresAt = c.expires_at ? new Date(c.expires_at) : null
      const daysLeft  = expiresAt ? Math.ceil((expiresAt - Date.now()) / 86400000) : null
      certInfo = {
        level:        c.level,
        status:       c.status,
        grantedAt:    c.granted_at,
        expiresAt:    c.expires_at,
        daysLeft,
        expiringSoon: daysLeft !== null && daysLeft <= 60,
        expired:      daysLeft !== null && daysLeft <= 0,
      }
    }

    res.json({ ...company, certInfo })
  } catch (err) {
    console.error('Verify error:', err.message)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// ─── Sitemap.xml — dynamic, includes all certified company verify pages ───────
app.get('/sitemap.xml', async (req, res) => {
  const FRONTEND = process.env.FRONTEND_URL || 'https://mydd.work'
  const STATIC = ['', '/registry', '/login', '/register']
  try {
    const result = await query(
      'SELECT id, updated_at FROM companies WHERE certification_level > 0 ORDER BY id ASC'
    )
    const urls = [
      ...STATIC.map(p => ({ loc: `${FRONTEND}${p}`, changefreq: 'weekly', priority: p === '' ? '1.0' : '0.8' })),
      ...result.rows.map(r => ({
        loc: `${FRONTEND}/verify/${r.id}`,
        lastmod: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : undefined,
        changefreq: 'monthly',
        priority: '0.9',
      })),
    ]
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map(u => [
        '  <url>',
        `    <loc>${u.loc}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
        `    <changefreq>${u.changefreq}</changefreq>`,
        `    <priority>${u.priority}</priority>`,
        '  </url>',
      ].filter(Boolean).join('\n')),
      '</urlset>',
    ].join('\n')
    res.set('Content-Type', 'application/xml; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(xml)
  } catch (err) {
    console.error('Sitemap error:', err.message)
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>')
  }
})

// ─── robots.txt ───────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const FRONTEND = process.env.FRONTEND_URL || 'https://mydd.work'
  res.set('Content-Type', 'text/plain')
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${FRONTEND}/sitemap.xml\n`)
})

// ─── Public Supplier Registry ────────────────────────────────────────────────
app.get('/api/registry', publicReadLimiter, async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 100)
    const offset = (page - 1) * limit
    const search  = String(req.query.q || req.query.search || '').trim()
    const country = String(req.query.country || '').trim()
    const level   = parseInt(req.query.level || '0', 10) || 0

    const conditions = ['certification_level > 0']
    const params = []
    let pi = 1

    if (search) {
      conditions.push(`(company_name ILIKE $${pi} OR name ILIKE $${pi} OR sector ILIKE $${pi} OR industry ILIKE $${pi})`)
      params.push(`%${search}%`); pi++
    }
    if (country) {
      conditions.push(`country ILIKE $${pi}`)
      params.push(`%${country}%`); pi++
    }
    if (level > 0) {
      conditions.push(`certification_level >= $${pi}`)
      params.push(level); pi++
    }

    const where = conditions.join(' AND ')

    const [rowsResult, totalResult] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.company_name, c.sector, c.industry, c.country, c.website,
                c.certification_level, c.status,
                ts.score      AS trust_score,
                ts.risk_level AS trust_risk
         FROM companies c
         LEFT JOIN LATERAL (
           SELECT score, risk_level
             FROM trust_scores
            WHERE company_id = c.id
            ORDER BY computed_at DESC
            LIMIT 1
         ) ts ON TRUE
         WHERE ${where}
         ORDER BY c.certification_level DESC, c.id DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM companies WHERE ${where}`, params),
    ])

    const total = totalResult.rows[0]?.total || 0
    res.json({
      data: rowsResult.rows.map(r => ({
        id:         r.id,
        name:       r.company_name || r.name || '',
        sector:     r.sector || r.industry || '',
        country:    r.country || '',
        website:    r.website || '',
        level:      r.certification_level || 0,
        status:     r.status,
        trustScore: r.trust_score != null ? parseInt(r.trust_score, 10) : null,
        trustRisk:  r.trust_risk || null,
      })),
      pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
    })
  } catch (err) {
    console.error('Registry search error:', err.message)
    res.status(500).json({ error: 'Failed to load registry' })
  }
})

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor(process.uptime()),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    node: process.version,
    env: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown',
  })
})

// Liveness probe — process is running (never checks DB).
// Suitable for Kubernetes/Railway liveness: if this fails, restart the container.
app.get('/api/health/live', (req, res) => {
  res.json({ alive: true, uptimeSec: Math.floor(process.uptime()) })
})

// Readiness probe — process is ready to serve traffic (DB must be reachable).
// Suitable for Kubernetes/Railway readiness: if this fails, remove from load balancer.
app.get('/api/health/ready', async (req, res) => {
  try {
    await query('SELECT 1')
    res.json({ ready: true, db: 'ok' })
  } catch (err) {
    console.error('Readiness check failed:', err.message)
    res.status(503).json({ ready: false, db: 'unreachable', error: err.message })
  }
})

// Public status page — human-readable HTML showing live service state.
app.get('/status', async (req, res) => {
  let dbOk = false
  let dbLatencyMs = null
  try {
    const t0 = Date.now()
    await query('SELECT 1')
    dbLatencyMs = Date.now() - t0
    dbOk = true
  } catch (_) { /* db unreachable */ }

  const uptimeSec = Math.floor(process.uptime())
  const overallStatus = dbOk ? 'Operational' : 'Degraded'
  const statusColor = dbOk ? '#22c55e' : '#ef4444'

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>B&E Trusted Registry — Status</title>
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
  <h1>B&amp;E Trusted Registry</h1>
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

// --- Prometheus-compatible metrics endpoint ---
app.get('/metrics', (req, res) => {
  const uptimeSec = (Date.now() - startTime) / 1000
  const mem = process.memoryUsage()
  const avgLatencyMs = requestCount > 0 ? totalLatency / requestCount : 0
  const errorRatePct = requestCount > 0 ? (errorCount / requestCount) * 100 : 0
  const runtimeMetrics = getRuntimeMetrics()

  const lines = [
    '# HELP process_uptime_seconds Total uptime of the process in seconds',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${uptimeSec.toFixed(3)}`,
    '',
    '# HELP http_requests_total Total number of HTTP requests received',
    '# TYPE http_requests_total counter',
    `http_requests_total ${requestCount}`,
    '',
    '# HELP http_errors_total Total number of HTTP responses with status >= 400',
    '# TYPE http_errors_total counter',
    `http_errors_total ${errorCount}`,
    '',
    '# HELP http_request_latency_avg_ms Average request latency in milliseconds',
    '# TYPE http_request_latency_avg_ms gauge',
    `http_request_latency_avg_ms ${avgLatencyMs.toFixed(3)}`,
    '',
    '# HELP http_error_rate_percent Percentage of requests that resulted in an error',
    '# TYPE http_error_rate_percent gauge',
    `http_error_rate_percent ${errorRatePct.toFixed(4)}`,
    '',
    '# HELP metrics_degraded_total Total number of degraded /api/metrics/business responses',
    '# TYPE metrics_degraded_total counter',
    `metrics_degraded_total ${runtimeMetrics.metricsDegradedTotal}`,
    '',
    '# HELP metrics_query_timeout_total Total number of query timeouts while computing metrics',
    '# TYPE metrics_query_timeout_total counter',
    `metrics_query_timeout_total ${runtimeMetrics.metricsQueryTimeoutTotal}`,
    '',
    '# HELP process_resident_memory_bytes Resident set size memory usage in bytes',
    '# TYPE process_resident_memory_bytes gauge',
    `process_resident_memory_bytes ${mem.rss}`,
    '',
    '# HELP process_heap_used_bytes Heap memory currently in use in bytes',
    '# TYPE process_heap_used_bytes gauge',
    `process_heap_used_bytes ${mem.heapUsed}`,
    '',
    '# HELP process_heap_total_bytes Total heap memory allocated in bytes',
    '# TYPE process_heap_total_bytes gauge',
    `process_heap_total_bytes ${mem.heapTotal}`,
  ]

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  res.send(lines.join('\n') + '\n')
})

// --- JSON metrics endpoint for modern dashboards ---
app.get('/metrics/json', (req, res) => {
  const mem = process.memoryUsage()
  const avgLatencyMs = requestCount > 0 ? totalLatency / requestCount : 0
  const errorRatePct = requestCount > 0 ? (errorCount / requestCount) * 100 : 0
  const runtimeMetrics = getRuntimeMetrics()

  res.json({
    timestamp: new Date().toISOString(),
    uptime_ms: Date.now() - startTime,
    requests_total: requestCount,
    errors_total: errorCount,
    metrics_degraded_total: runtimeMetrics.metricsDegradedTotal,
    metrics_query_timeout_total: runtimeMetrics.metricsQueryTimeoutTotal,
    latency_avg_ms: parseFloat(avgLatencyMs.toFixed(3)),
    error_rate_percent: parseFloat(errorRatePct.toFixed(4)),
    memory: {
      rss_mb: parseFloat((mem.rss / 1024 / 1024).toFixed(2)),
      heap_used_mb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
      heap_total_mb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
    },
    node_version: process.version,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown',
  })
})

// Must be registered after all controllers and before custom error middleware.
if (Sentry) Sentry.setupExpressErrorHandler(app)

app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS origin denied' })
  }
  return next(err)
})

const PORT = process.env.PORT || 8080

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/metrics' })

// Per-user WebSocket client map (userId → Set of ws)
const userWsClients = new Map()
const notifyUser = (userId, payload) => {
  const clients = userWsClients.get(Number(userId))
  if (!clients) return
  const msg = JSON.stringify(payload)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

const getBusinessMetrics = async () => {
  try {
    const combined = await query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users_total,
         (SELECT COUNT(*) FROM companies) AS companies_total,
         (SELECT COUNT(*) FROM companies WHERE certification_level > 0) AS certified_total,
         (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = FALSE) AS fraud_alerts_active,
         (SELECT ROUND(AVG(score), 1)
            FROM trust_scores
           WHERE computed_at > NOW() - INTERVAL '7 days') AS avg_trust_score,
         (SELECT COALESCE(SUM(
           CASE certification_level
             WHEN 1 THEN 490
             WHEN 2 THEN 990
             WHEN 3 THEN 2490
             ELSE 0
           END
         ), 0)
            FROM companies
           WHERE certification_level > 0) AS revenue_total_usd`,
    )
    const row = combined.rows[0] || {}
    const usersTotal = parseInt(row.users_total || '0', 10)
    const companiesTotal = parseInt(row.companies_total || '0', 10)
    const certifiedTotal = parseInt(row.certified_total || '0', 10)
    return {
      timestamp: new Date().toISOString(),
      users_total: usersTotal,
      companies_total: companiesTotal,
      certified_total: certifiedTotal,
      cert_rate_pct: companiesTotal > 0 ? Math.round((certifiedTotal / companiesTotal) * 100) : 0,
      fraud_alerts_active: parseInt(row.fraud_alerts_active || '0', 10),
      avg_trust_score: parseFloat(row.avg_trust_score || 0),
      revenue_total_usd: parseFloat(row.revenue_total_usd || 0),
      requests_total: requestCount,
    }
  } catch (e) {
    console.error('getBusinessMetrics error:', e.message)
    return null
  }
}

wss.on('connection', (ws, req) => {
  // Authenticate via httpOnly cookie (token is never exposed in the URL)
  let wsUserId = null
  try {
    // Parse cookies from the upgrade request headers
    const rawCookies = req.headers.cookie || ''
    const cookieMap = Object.fromEntries(
      rawCookies.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
    )
    const token = cookieMap['token']
    if (token) {
      const decoded = jwt.verify(token, SECRET)
      wsUserId = decoded?.id ? Number(decoded.id) : null
    }
  } catch { /* anonymous WS — only gets aggregate metrics */ }

  if (wsUserId !== null) {
    if (!userWsClients.has(wsUserId)) userWsClients.set(wsUserId, new Set())
    userWsClients.get(wsUserId).add(ws)
  }

  getBusinessMetrics().then(data => {
    if (data && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'metrics', data }))
    }
  }).catch(() => {})

  ws.on('close', () => {
    if (wsUserId !== null) {
      const clients = userWsClients.get(wsUserId)
      if (clients) {
        clients.delete(ws)
        if (clients.size === 0) userWsClients.delete(wsUserId)
      }
    }
  })
})

// ── Global error handler ──────────────────────────────────────────────────────
// Must be registered after all routes. Catches any unhandled Express error.
if (Sentry) app.use(Sentry.expressErrorHandler())

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  console.error(JSON.stringify({
    event: 'unhandled_error',
    reqId: req.reqId,
    method: req.method,
    path: req.originalUrl,
    status,
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  }))
  if (!res.headersSent) {
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : (err.message || 'Error') })
  }
})

const startServer = async () => {
  try {
    // Listen first — healthcheck must respond immediately.
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(PORT, () => {
        server.removeListener('error', reject)
        resolve()
      })
    })
    console.log(`Backend running on port ${PORT}`)

    // Init DB after port is bound so healthcheck can always respond.
    try {
      await initDb()
      console.log('Database initialized')
    } catch (dbErr) {
      console.error('Database init error (non-fatal):', dbErr.code || '', dbErr.message || String(dbErr))
    }

    // Purge expired tokens every hour — keeps token_blacklist + refresh_tokens lean.
    setInterval(async () => {
      try {
        const r1 = await query('DELETE FROM token_blacklist  WHERE expires_at <= NOW()')
        const r2 = await query('DELETE FROM refresh_tokens   WHERE expires_at <= NOW()')
        if ((r1.rowCount + r2.rowCount) > 0) {
          console.log(JSON.stringify({ event: 'token_cleanup', blacklist: r1.rowCount, refresh: r2.rowCount }))
        }
      } catch (e) {
        console.error('Token cleanup error:', e.message)
      }
    }, 60 * 60 * 1000)

    // ── Renewal reminder cron — runs once at boot + every 24 h ────────────────
    const runRenewalReminders = async () => {
      try {
        // Find active certifications expiring in 25-35 days with no reminder sent yet
        const result = await query(
          `SELECT c.id AS cert_id, c.level, c.expires_at,
                  co.company_name, co.user_id,
                  u.email, u.name
             FROM certifications c
             JOIN companies co ON co.id = c.company_id
             JOIN users     u  ON u.id  = co.user_id
            WHERE c.status = 'active'
              AND c.expires_at BETWEEN NOW() + INTERVAL '25 days' AND NOW() + INTERVAL '35 days'
              AND c.renewal_reminder_sent_at IS NULL
              AND u.email IS NOT NULL`
        )
        if (!result.rows.length) return
        const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
        for (const row of result.rows) {
          await sendRenewalReminder({
            email:       row.email,
            name:        row.name,
            companyName: row.company_name,
            level:       row.level,
            expiresAt:   row.expires_at,
            renewUrl:    `${frontendUrl}/dashboard`,
          })
          await query(
            'UPDATE certifications SET renewal_reminder_sent_at = NOW() WHERE id = $1',
            [row.cert_id]
          )
        }
        console.log(JSON.stringify({ event: 'renewal_reminders_sent', count: result.rows.length }))
      } catch (e) {
        console.error('Renewal reminder cron error:', e.message)
      }
    }
    // Delay first run 5 min after boot to let DB stabilize, then run every 24 h
    setTimeout(runRenewalReminders, 5 * 60 * 1000)
    setInterval(runRenewalReminders, 24 * 60 * 60 * 1000)

    // ── Urgent reminder — D-7 ─────────────────────────────────────────────────
    // Second reminder for certs expiring in 5-7 days with no email in last 4 days.
    const runUrgentReminders = async () => {
      try {
        const result = await query(
          `SELECT c.id AS cert_id, c.level, c.expires_at,
                  co.company_name, u.email, u.name
             FROM certifications c
             JOIN companies co ON co.id = c.company_id
             JOIN users     u  ON u.id  = co.user_id
            WHERE c.status = 'active'
              AND c.expires_at BETWEEN NOW() + INTERVAL '5 days' AND NOW() + INTERVAL '7 days'
              AND (c.renewal_reminder_sent_at IS NULL
                   OR c.renewal_reminder_sent_at < NOW() - INTERVAL '4 days')
              AND u.email IS NOT NULL`
        )
        if (!result.rows.length) return
        const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
        for (const row of result.rows) {
          await sendRenewalReminder({
            email: row.email, name: row.name, companyName: row.company_name,
            level: row.level, expiresAt: row.expires_at,
            renewUrl: `${frontendUrl}/dashboard`,
          })
          await query(
            'UPDATE certifications SET renewal_reminder_sent_at = NOW() WHERE id = $1',
            [row.cert_id]
          )
        }
        if (result.rows.length) {
          console.log(JSON.stringify({ event: 'urgent_reminders_sent', count: result.rows.length }))
        }
      } catch (e) {
        console.error('Urgent reminder cron error:', e.message)
      }
    }
    setTimeout(runUrgentReminders, 7 * 60 * 1000)
    setInterval(runUrgentReminders, 24 * 60 * 60 * 1000)

    // ── Cert expiry enforcement — runs every 24 h ─────────────────────────────
    // Marks expired certs, revokes company certification level, notifies by email.
    const runCertExpiryCleanup = async () => {
      try {
        const expired = await query(
          `UPDATE certifications
              SET status = 'expired', updated_at = NOW()
            WHERE status = 'active'
              AND expires_at < NOW()
            RETURNING id, company_id, level`
        )
        if (!expired.rows.length) return

        for (const cert of expired.rows) {
          // Downgrade the company's visible certification level
          await query(
            `UPDATE companies
                SET certification_level = 0, updated_at = NOW()
              WHERE id = $1
                AND NOT EXISTS (
                  SELECT 1 FROM certifications
                   WHERE company_id = $1 AND status = 'active'
                )`,
            [cert.company_id]
          )
          // Notify the company contact
          const userRow = await query(
            `SELECT u.email, u.name, co.company_name
               FROM companies co JOIN users u ON u.id = co.user_id
              WHERE co.id = $1 LIMIT 1`,
            [cert.company_id]
          )
          if (userRow.rows.length && userRow.rows[0].email) {
            const { email, name, company_name } = userRow.rows[0]
            const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
            await sendCertExpired({
              email, name, companyName: company_name,
              level: cert.level,
              renewUrl: `${frontendUrl}/dashboard`,
            }).catch(() => {})
          }
        }
        console.log(JSON.stringify({ event: 'certs_expired', count: expired.rows.length }))
      } catch (e) {
        console.error('Cert expiry cleanup error:', e.message)
      }
    }
    setTimeout(runCertExpiryCleanup, 10 * 60 * 1000)
    setInterval(runCertExpiryCleanup, 24 * 60 * 60 * 1000)

    // Broadcast business metrics every 10 s to all connected WS clients.
    setInterval(async () => {
      if (wss.clients.size === 0) return
      const data = await getBusinessMetrics()
      if (!data) return
      const msg = JSON.stringify({ type: 'metrics', data })
      for (const ws of wss.clients) {
        if (ws.readyState === 1) ws.send(msg)
      }
    }, 10_000)
  } catch (err) {
    console.error('Failed to initialize backend:', err.message)
    process.exit(1)
  }
}

startServer()
