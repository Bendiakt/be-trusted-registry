require('./instrument.js')
require('dotenv').config()

// ── Global error safety net ───────────────────────────────────────────────────
// Prevent transient Redis disconnects from crashing the process.
// The primary fix is in lib/rateLimiter.js (command-specific fail-open return
// values). This handler is a defence-in-depth layer for any other Redis-related
// unhandled rejections that might slip through.
process.on('unhandledRejection', (reason) => {
  const msg = (reason && reason.message) || String(reason)
  if (
    msg.includes('unexpected reply from redis client') ||
    msg.includes("Stream isn't writeable") ||
    msg.includes('enableOfflineQueue')
  ) {
    console.warn(JSON.stringify({
      event:   'process.unhandledRejection.redis_absorbed',
      message: msg,
      note:    'Redis disconnect absorbed — server continues running',
    }))
    return  // absorb: do NOT re-throw, do NOT crash
  }
  // All other unhandled rejections: log and crash (default Node behaviour).
  console.error(JSON.stringify({ event: 'process.unhandledRejection', message: msg }))
  process.exit(1)
})

// Eagerly initialise Redis so the client is ready before the first request.
// lib/redis.js handles REDIS_URL absence gracefully (logs warning, returns null).
require('./lib/redis').getRedis()
const express      = require('express')
const cors         = require('cors')
const cookieParser = require('cookie-parser')
const crypto       = require('crypto')
const http         = require('http')
const { auth }     = require('./lib/auth')
const { incRequest } = require('./lib/runtimeMetrics')
const { setupWsServer } = require('./lib/wsServer')
const { startCronJobs }             = require('./lib/cronJobs')
const metricsRouter    = require('./routes/metrics')
const badgeRouter      = require('./routes/badge')
const prometheusRouter = require('./routes/prometheus')
const { query, initDb } = require('./db')

// ── Sentry (optional — activates when SENTRY_DSN env var is set) ─────────────
let Sentry = null
if (process.env.SENTRY_DSN) {
  try {
    Sentry = require('@sentry/node')
    Sentry.init({
      dsn:                process.env.SENTRY_DSN,
      environment:        process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'production',
      tracesSampleRate:   0.1,   // 10 % of requests traced
      profilesSampleRate: 0.05,  // 5 % of traced requests profiled (CPU flamegraphs)
      // Scrub PII from request bodies before sending to Sentry.
      // Passwords, tokens and card data must never appear in error reports.
      beforeSend (event) {
        if (event.request?.data) {
          const PII_KEYS = ['password', 'token', 'secret', 'card', 'cvv', 'ssn', 'email']
          const scrub = (obj) => {
            if (!obj || typeof obj !== 'object') return obj
            return Object.fromEntries(
              Object.entries(obj).map(([k, v]) => [
                k,
                PII_KEYS.some(p => k.toLowerCase().includes(p)) ? '[Filtered]' : scrub(v),
              ])
            )
          }
          event.request.data = scrub(event.request.data)
        }
        return event
      },
    })
    console.log(JSON.stringify({ event: 'sentry.initialized', env: process.env.NODE_ENV || 'production' }))
  } catch (e) {
    console.warn(JSON.stringify({ event: 'sentry.init_failed', err: e.message, hint: 'run npm install in backend' }))
    Sentry = null
  }
}

const app = express()

// Railway (and most PaaS) terminate TLS at a reverse proxy and forward
// the real client IP via X-Forwarded-For. Trust that single proxy hop so
// express-rate-limit can identify clients correctly.
app.set('trust proxy', 1)

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
    incRequest(durationMs, res.statusCode)
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
  // HSTS — only meaningful over HTTPS (Railway terminates TLS at the proxy layer)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
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
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

const jsonMiddleware = express.json({ limit: '2mb' })
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') return next()
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
const CSRF_EXEMPT = ['/api/payments/webhook']

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

// auth and SECRET are imported from lib/auth above.
// ── Required environment variables ───────────────────────────────────────────
// Fail fast at startup rather than crashing in the middle of a request.
;(function validateEnv() {
  const REQUIRED = ['JWT_SECRET', 'DATABASE_URL']
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  // Warn about important-but-optional vars that degrade functionality
  const RECOMMENDED = ['JWT_REFRESH_SECRET', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'FRONTEND_URL', 'SENTRY_DSN', 'REDIS_URL', 'METRICS_TOKEN']
  const absent = RECOMMENDED.filter((k) => !process.env[k])
  if (absent.length) {
    console.warn(JSON.stringify({ event: 'env_warning', missing: absent, note: 'Some features may be degraded' }))
  }
})()

const { router: paymentsRouter }  = require('./routes/payments')
const documentsRouter             = require('./routes/documents')
const traderRouter                = require('./routes/trader')
const authRouter                  = require('./routes/auth')
const totpRouter                  = require('./routes/totp')
const adminRouter                 = require('./routes/admin')
const notificationsRouter         = require('./routes/notifications')
const companiesRouter             = require('./routes/companies')
const pacRouter                   = require('./routes/pac')
const pacSupervisionRouter        = require('./routes/pacSupervision')
const registryRouter              = require('./routes/registry')
const verifyRouter                = require('./routes/verify')
const sitemapRouter               = require('./routes/sitemap')

// ── OpenAPI / Swagger UI ──────────────────────────────────────────────────────
// Served at /api/docs in all environments. Parsing is done once at startup;
// if the YAML file is missing (e.g. stripped in a minimal Docker image) the
// block is silently skipped rather than crashing the server.
try {
  const swaggerUi = require('swagger-ui-express')
  const YAML      = require('yaml')
  const fs        = require('fs')
  const path      = require('path')
  const specPath  = path.join(__dirname, 'openapi.yaml')
  if (fs.existsSync(specPath)) {
    const openApiSpec = YAML.parse(fs.readFileSync(specPath, 'utf8'))
    // Relax the API-only CSP for the Swagger UI page (it loads inline scripts)
    app.use('/api/docs', (req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
      )
      next()
    })
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'MyDD API',
      swaggerOptions: { persistAuthorization: true },
    }))
    console.log(JSON.stringify({ event: 'swagger_ui.mounted', path: '/api/docs' }))
  } else {
    console.warn(JSON.stringify({ event: 'swagger_ui.skipped', reason: 'openapi.yaml not found' }))
  }
} catch (e) {
  console.warn(JSON.stringify({ event: 'swagger_ui.error', message: e.message }))
}

// ── Router mounts ─────────────────────────────────────────────────────────────
app.post('/api/payments/create-checkout-session', auth)
app.post('/api/payments/renewal-checkout',        auth)
app.post('/api/payments/trader-checkout',         auth)
app.post('/api/payments/portal',                  auth)
app.get('/api/payments/stats',                    auth)
app.get('/api/payments/trader-subscription',      auth)
app.use('/api/payments',       paymentsRouter)
app.use('/api/metrics',        metricsRouter)
app.use('/api/badge',          badgeRouter)
app.use('/api/documents',      auth, documentsRouter)
app.use('/api/trader',         auth, traderRouter)
app.use('/api/auth',           authRouter)
app.use('/api/auth/2fa',       totpRouter)
app.use('/api/admin',          adminRouter)
app.use('/api/notifications',  auth, notificationsRouter)
app.use('/api/companies',      companiesRouter)
app.use('/api/pac',            pacRouter)
app.use('/api/pac',            pacSupervisionRouter)
app.use('/api/registry',       registryRouter)
app.use('/api/verify',         verifyRouter)
app.use('/api/keys',           require('./routes/apiKeys'))
app.use('/api/webhooks',       require('./routes/webhooks'))
app.use('/api/translate',      require('./routes/translate'))
app.use('/',                   prometheusRouter)   // GET /metrics + GET /metrics/json
app.use('/',                   sitemapRouter)      // GET /sitemap.xml + GET /robots.txt
app.use('/',                   require('./routes/health'))  // health probes + /status page

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

const PORT   = process.env.PORT || 8080
const server = http.createServer(app)
setupWsServer(server)  // mounts /ws/metrics WebSocket endpoint

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
      console.error(JSON.stringify({ event: 'db.init_error', code: dbErr.code || null, err: dbErr.message || String(dbErr) }))
    }

    // Warn if Redis is not configured (rate limiters fall back to in-memory)
    const { isRedisAvailable } = require('./lib/redis')
    if (!isRedisAvailable()) {
      console.warn(JSON.stringify({
        event: 'startup.warning',
        msg:   'REDIS_URL not set — rate limiters use in-memory store (resets on restart, not suitable for multi-instance or high-traffic prod). Add Railway Redis plugin and set REDIS_URL.',
      }))
    }

    // Warn if transactional email is not configured
    if (!process.env.RESEND_API_KEY) {
      console.warn(JSON.stringify({
        event: 'startup.warning',
        msg:   'RESEND_API_KEY not set — transactional emails (welcome, password reset, payment confirmation) will be logged but not sent.',
      }))
    }

    // Start all scheduled background jobs (token cleanup, renewal reminders, cert expiry)
    startCronJobs()


  } catch (err) {
    console.error(JSON.stringify({ event: 'server.startup_failed', err: err.message }))
    process.exit(1)
  }
}

startServer()
