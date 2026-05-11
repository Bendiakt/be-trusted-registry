require('./instrument.js')
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')
const http = require('http')
const { WebSocketServer } = require('ws')
const { hashForIntegrity } = require('./lib/encryption')
const { checkFraud } = require('./lib/fraudDetection')
const { getRuntimeMetrics } = require('./lib/runtimeMetrics')
const metricsRouter = require('./routes/metrics')
const badgeRouter  = require('./routes/badge')
const { computeTrustScore } = require('./lib/trustScore')
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

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  throw new Error('Missing JWT_SECRET environment variable')
}

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || SECRET
if (!process.env.JWT_REFRESH_SECRET) {
  console.warn('JWT_REFRESH_SECRET is missing; falling back to JWT_SECRET')
}

const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

const issueAccessToken = (user) => {
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { jti, id: user.id, role: user.role, name: user.name, email: user.email },
    SECRET,
    { expiresIn: '15m' }
  )
  return { token, jti }
}

const issueRefreshToken = (user) => {
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { jti, id: user.id, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: '30d' }
  )
  return { token, jti }
}

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.' },
})

// Public endpoints rate limits — prevent enumeration / scraping
const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    return `${ipKeyGenerator(req)}:${email}`
  },
  message: { error: 'Too many login attempts. Try again later.' },
})

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(token, SECRET)
    if (decoded?.jti) {
      const blacklisted = await query(
        'SELECT 1 FROM token_blacklist WHERE jti = $1 AND expires_at > NOW() LIMIT 1',
        [decoded.jti]
      )
      if (blacklisted.rows.length > 0) {
        return res.status(401).json({ error: 'Token revoked' })
      }
    }
    req.user = decoded
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
  return next()
}

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

const mapMissionRow = (row) => {
  if (!row) return null
  return {
    id:           row.id,
    company_id:   row.company_id,
    company_name: row.company_name || '',
    location:     row.location    || '',
    type:         row.type        || '',
    description:  row.description || '',
    fee:          row.fee_usd     || 500,
    assigned_to:  row.assigned_to,
    status:       row.status,
    createdAt:    row.created_at,
    reportText:   row.report_text  || null,
    outcome:      row.outcome      || null,
    completedAt:  row.completed_at || null,
  }
}

const { router: paymentsRouter } = require('./routes/payments')
const documentsRouter = require('./routes/documents')
const traderRouter    = require('./routes/trader')
const { sendWelcome, sendPasswordReset, sendMissionAssigned, sendMissionCompleted, sendCertGranted, sendEmailVerification, sendRenewalReminder, sendCertExpired } = require('./lib/mailer')
app.post('/api/payments/create-checkout-session', auth)
app.get('/api/payments/stats', auth)
app.post('/api/stripe/create-checkout-session', auth)
app.get('/api/stripe/stats', auth)
app.use('/api/payments', paymentsRouter)
app.use('/api/stripe', paymentsRouter)
app.use('/api/metrics',   metricsRouter)
app.use('/api/badge',     badgeRouter)
app.use('/api/documents', auth, documentsRouter)
app.use('/api/trader',    auth, traderRouter)

// Immutable audit trail helper — fire-and-forget (never blocks response)
const logAudit = (userId, action, resource, ip, payload) => {
  const hash = hashForIntegrity(payload || '')
  query(
    'INSERT INTO audit_log (user_id, action, resource, ip_address, payload_hash) VALUES ($1, $2, $3, $4, $5)',
    [userId || null, action, resource || null, ip || null, hash],
  ).catch(e => console.error('audit_log write failed:', e.message))
}

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' })

    const nameStr = String(name).trim()
    const emailStr = String(email).trim().toLowerCase()
    const passwordStr = String(password)

    if (nameStr.length < 2 || nameStr.length > 120) return res.status(400).json({ error: 'Name must be 2–120 characters' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) return res.status(400).json({ error: 'Invalid email address' })
    if (passwordStr.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    if (passwordStr.length > 128) return res.status(400).json({ error: 'Password too long' })
    const VALID_ROLES = ['company', 'trader', 'pac']
    const resolvedRole = VALID_ROLES.includes(role) ? role : 'company'

    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [emailStr])
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' })

    const hash = await bcrypt.hash(passwordStr, 10)
    const verifyToken   = crypto.randomBytes(32).toString('hex')
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    await query(
      `INSERT INTO users (name, email, password, role, email_verify_token, email_verify_expires)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nameStr, emailStr, hash, resolvedRole, verifyToken, verifyExpires]
    )

    res.json({ message: 'Registered successfully. Please check your email to verify your account.' })
    logAudit(null, 'user_register', 'users', req.ip, { email: emailStr, role: resolvedRole })

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    sendEmailVerification({
      email: emailStr,
      name: nameStr,
      verifyUrl: `${frontendUrl}/verify-email?token=${verifyToken}`,
    }).catch(() => {})
    sendWelcome({ email: emailStr, name: nameStr }).catch(() => {})
    await checkFraud({ userId: null, email: emailStr, ip: req.ip, action: 'user_register' }).catch(() => {})
  } catch (err) {
    console.error('Register error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// GET /api/auth/verify-email?token=xxx — confirm email ownership
app.get('/api/auth/verify-email', async (req, res) => {
  const token = String(req.query.token || '').trim()
  if (!token) return res.status(400).json({ error: 'Missing token' })
  try {
    const result = await query(
      `UPDATE users
          SET email_verified = TRUE, email_verify_token = NULL, email_verify_expires = NULL
        WHERE email_verify_token = $1
          AND email_verify_expires > NOW()
          AND email_verified = FALSE
       RETURNING id, email`,
      [token]
    )
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired token' })
    logAudit(result.rows[0].id, 'email_verified', 'users', req.ip, { email: result.rows[0].email })
    res.json({ message: 'Email verified successfully' })
  } catch (err) {
    console.error('Email verify error:', err.message)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// POST /api/auth/resend-verification — resend the verification email
const resendVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false })
app.post('/api/auth/resend-verification', resendVerifyLimiter, auth, async (req, res) => {
  try {
    const userResult = await query('SELECT id, name, email, email_verified FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    const user = userResult.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.email_verified) return res.status(400).json({ error: 'Email already verified' })

    const newToken   = crypto.randomBytes(32).toString('hex')
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await query(
      'UPDATE users SET email_verify_token = $1, email_verify_expires = $2 WHERE id = $3',
      [newToken, newExpires, req.user.id]
    )

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    sendEmailVerification({
      email: user.email,
      name:  user.name,
      verifyUrl: `${frontendUrl}/verify-email?token=${newToken}`,
    }).catch(() => {})

    res.json({ message: 'Verification email sent' })
  } catch (err) {
    console.error('Resend verify error:', err.message)
    res.status(500).json({ error: 'Failed to resend' })
  }
})

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body
    const userResult = await query('SELECT id, name, email, password, role FROM users WHERE email = $1 LIMIT 1', [email])
    const user = userResult.rows[0]
    if (!user) return res.status(400).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' })

    const { token, jti } = issueAccessToken(user)
    const { token: refreshToken } = issueRefreshToken(user)
    const refreshDecoded = jwt.decode(refreshToken)

    await Promise.all([
      query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, to_timestamp($3))`,
        [user.id, hashToken(refreshToken), refreshDecoded.exp]
      ),
      query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]),
    ])

    res.json({
      token,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    })
    logAudit(user.id, 'user_login', 'users', req.ip, { email, jti })
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(500).json({ error: 'Login failed' })
  }
})

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken
    if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' })

    const payload = jwt.verify(refreshToken, REFRESH_SECRET)
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token' })

    const stored = await query(
      `SELECT id, user_id
       FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [hashToken(refreshToken)]
    )
    if (stored.rows.length === 0) return res.status(401).json({ error: 'Refresh token revoked or expired' })

    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.rows[0].id])

    const userResult = await query(
      'SELECT id, name, email, role FROM users WHERE id = $1 LIMIT 1',
      [stored.rows[0].user_id]
    )
    const user = userResult.rows[0]
    if (!user) return res.status(401).json({ error: 'User not found' })

    const { token } = issueAccessToken(user)
    const { token: newRefreshToken } = issueRefreshToken(user)
    const newRefreshDecoded = jwt.decode(newRefreshToken)
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, to_timestamp($3))`,
      [user.id, hashToken(newRefreshToken), newRefreshDecoded.exp]
    )

    return res.json({ token, refreshToken: newRefreshToken })
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' })
  }
})

app.post('/api/auth/logout', auth, async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1]
    const refreshToken = req.body?.refreshToken || null
    const decoded = jwt.verify(accessToken, SECRET)

    if (decoded?.jti && decoded?.exp) {
      await query(
        `INSERT INTO token_blacklist (jti, user_id, expires_at)
         VALUES ($1, $2, to_timestamp($3))
         ON CONFLICT (jti) DO NOTHING`,
        [decoded.jti, decoded.id || null, decoded.exp]
      )
    }

    if (refreshToken) {
      await query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE token_hash = $1 AND user_id = $2`,
        [hashToken(refreshToken), decoded.id]
      )
    }

    await query('DELETE FROM token_blacklist WHERE expires_at <= NOW()')
    await query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()')

    return res.json({ message: 'Logged out' })
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
})

app.get('/api/companies', auth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1)
    const requestedLimit = parseInt(req.query.limit || '20', 10) || 20
    const limit = Math.min(Math.max(requestedLimit, 1), 100)
    const offset = (page - 1) * limit
    const search = String(req.query.search || '').trim()

    let rowsResult
    let totalResult
    if (search) {
      const like = `%${search}%`
      rowsResult = await query(
        `SELECT * FROM companies
         WHERE company_name ILIKE $1 OR name ILIKE $1 OR country ILIKE $1 OR sector ILIKE $1
         ORDER BY id DESC
         LIMIT $2 OFFSET $3`,
        [like, limit, offset]
      )
      totalResult = await query(
        `SELECT COUNT(*)::int AS total FROM companies
         WHERE company_name ILIKE $1 OR name ILIKE $1 OR country ILIKE $1 OR sector ILIKE $1`,
        [like]
      )
    } else {
      rowsResult = await query(
        'SELECT * FROM companies ORDER BY id DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      )
      totalResult = await query('SELECT COUNT(*)::int AS total FROM companies')
    }

    const total = totalResult.rows[0]?.total || 0
    const pages = Math.max(Math.ceil(total / limit), 1)
    res.json({
      data: rowsResult.rows.map(mapCompanyRow),
      pagination: { page, limit, total, pages },
    })
  } catch (err) {
    console.error('List companies error:', err.message)
    res.status(500).json({ error: 'Failed to load companies' })
  }
})

// Primary profile endpoint used by Dashboard
app.get('/api/companies/me', auth, async (req, res) => {
  try {
    const companyResult = await query('SELECT * FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    const companyRow = companyResult.rows[0]
    const company = mapCompanyRow(companyRow)

    // Attach active certification expiry info
    let certInfo = null
    if (companyRow?.id) {
      const certResult = await query(
        `SELECT level, status, granted_at, expires_at
         FROM certifications
         WHERE company_id = $1 AND status IN ('active', 'submitted')
         ORDER BY level DESC, id DESC
         LIMIT 1`,
        [companyRow.id]
      )
      if (certResult.rows.length > 0) {
        const c = certResult.rows[0]
        const expiresAt = c.expires_at ? new Date(c.expires_at) : null
        const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / 86400000) : null
        certInfo = {
          level:      c.level,
          status:     c.status,
          grantedAt:  c.granted_at,
          expiresAt:  c.expires_at,
          daysLeft,
          expiringSoon: daysLeft !== null && daysLeft <= 60,
          expired:      daysLeft !== null && daysLeft <= 0,
        }
      }
    }

    const userRow = await query('SELECT id, name, email, role, email_verified FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    const u = userRow.rows[0] || req.user
    res.json({
      company: company ? { ...company, certInfo } : null,
      user: { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: u.email_verified ?? false },
    })
  } catch (err) {
    console.error('My company error:', err.message)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

// Alias for backwards compatibility
app.get('/api/companies/mine', auth, async (req, res) => {
  try {
    const companyResult = await query('SELECT * FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    const company = mapCompanyRow(companyResult.rows[0])
    res.json(company || null)
  } catch (err) {
    console.error('Mine company error:', err.message)
    res.status(500).json({ error: 'Failed to load company' })
  }
})

// Create or update company profile (used by Dashboard RegisterCompanyForm)
app.post('/api/companies/register', auth, async (req, res) => {
  try {
    const { name, industry, sector, country, description, website } = req.body
    if (!name) return res.status(400).json({ error: 'Company name is required' })
    const companyName = String(name).trim().slice(0, 200)
    if (companyName.length < 2) return res.status(400).json({ error: 'Company name too short' })

    const clean = (v, max = 100) => (v || '').toString().trim().slice(0, max) || null
    const resolvedSector = clean(sector) || clean(industry)

    // Validate website — must be http:// or https:// to prevent javascript: URLs
    let cleanWebsite = null
    if (website) {
      const w = String(website).trim().slice(0, 500)
      if (w && !/^https?:\/\/.+/i.test(w)) {
        return res.status(400).json({ error: 'Website must start with http:// or https://' })
      }
      cleanWebsite = w || null
    }

    const result = await query(
      `INSERT INTO companies (user_id, name, company_name, industry, sector, country, description, website, status, certification_level)
       VALUES ($1, $2, $2, $3, $3, $4, $5, $6, 'pending', 0)
       ON CONFLICT (user_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         company_name = EXCLUDED.company_name,
         industry = EXCLUDED.industry,
         sector = EXCLUDED.sector,
         country = EXCLUDED.country,
         description = EXCLUDED.description,
         website = EXCLUDED.website,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, companyName, resolvedSector, clean(country), clean(description, 2000), cleanWebsite]
    )

    res.json({ company: mapCompanyRow(result.rows[0]) })
    logAudit(req.user.id, 'company_profile_update', 'companies', req.ip, { name, sector: resolvedSector, country })
    checkFraud({ userId: req.user.id, email: req.user.email, ip: req.ip, action: 'company_profile_update', companyId: result.rows[0].id }).catch(() => {})
    computeTrustScore(req.user.id).catch(() => {})
  } catch (err) {
    console.error('Register company error:', err.message)
    res.status(500).json({ error: 'Save failed' })
  }
})

// Legacy apply endpoint
app.post('/api/companies/apply', auth, async (req, res) => {
  try {
    const { companyName, country, sector, website } = req.body

    const existing = await query('SELECT id FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Application already submitted' })

    let applyWebsite = null
    if (website) {
      const w = String(website).trim().slice(0, 500)
      if (w && !/^https?:\/\/.+/i.test(w)) {
        return res.status(400).json({ error: 'Website must start with http:// or https://' })
      }
      applyWebsite = w || null
    }

    const result = await query(
      `INSERT INTO companies (
         user_id, name, company_name, industry, sector, country, website, status, certification_level
       ) VALUES ($1, $2, $2, $3, $3, $4, $5, 'pending', 0)
       RETURNING *`,
      [req.user.id, companyName || null, sector || null, country || null, applyWebsite]
    )

    res.json(mapCompanyRow(result.rows[0]))
  } catch (err) {
    console.error('Legacy apply error:', err.message)
    res.status(500).json({ error: 'Application failed' })
  }
})

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

app.get('/api/pac/missions', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    // PAC agent sees: all available missions + their own assigned/completed missions
    const result = await query(
      `SELECT * FROM missions
       WHERE status = 'available' OR assigned_to = $1
       ORDER BY
         CASE status WHEN 'assigned' THEN 0 WHEN 'available' THEN 1 ELSE 2 END,
         id DESC`,
      [req.user.id]
    )
    res.json(result.rows.map(mapMissionRow))
  } catch (err) {
    console.error('List missions error:', err.message)
    res.status(500).json({ error: 'Failed to load missions' })
  }
})

// GET single mission — PAC agent can only see missions assigned to them or available
app.get('/api/pac/missions/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const missionId = parseInt(req.params.id, 10)
    if (isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const result = await query(
      `SELECT m.*, u.name AS pac_agent_name, u.email AS pac_agent_email,
              pp.full_name AS pac_full_name, pp.location AS pac_location
         FROM missions m
         LEFT JOIN users u      ON u.id  = m.assigned_to
         LEFT JOIN pac_profiles pp ON pp.user_id = m.assigned_to
        WHERE m.id = $1
          AND (m.status = 'available' OR m.assigned_to = $2)
        LIMIT 1`,
      [missionId, req.user.id]
    )
    const row = result.rows[0]
    if (!row) return res.status(404).json({ error: 'Mission not found' })
    res.json({
      ...mapMissionRow(row),
      pacAgentName:  row.pac_agent_name  || row.pac_full_name  || null,
      pacAgentEmail: row.pac_agent_email || null,
      pacLocation:   row.pac_location    || null,
    })
  } catch (err) {
    console.error('Get mission error:', err.message)
    res.status(500).json({ error: 'Failed to load mission' })
  }
})

// GET /api/pac/missions/:id/pdf — generate PAC audit report as PDF (PAC agent or admin)
app.get('/api/pac/missions/:id/pdf', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const missionId = parseInt(req.params.id, 10)
    if (isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const result = await query(
      `SELECT m.*, u.name AS pac_agent_name,
              pp.full_name AS pac_full_name, pp.location AS pac_location
         FROM missions m
         LEFT JOIN users u         ON u.id    = m.assigned_to
         LEFT JOIN pac_profiles pp ON pp.user_id = m.assigned_to
        WHERE m.id = $1
          AND ($2 = 'admin' OR m.assigned_to = $3 OR m.status = 'available')
        LIMIT 1`,
      [missionId, req.user.role, req.user.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Mission not found' })

    const row = result.rows[0]
    const m   = { ...mapMissionRow(row), pacAgentName: row.pac_agent_name || row.pac_full_name || null, pacLocation: row.pac_location || null }

    // Lazy-require pdfkit
    let PDFDocument
    try { PDFDocument = require('pdfkit') } catch {
      return res.status(503).json({ error: 'PDF generation unavailable — run npm install in backend' })
    }

    const OUTCOME_COLOR = { pass: '#27ae60', fail: '#e74c3c', conditional: '#f39c12' }
    const accentColor = OUTCOME_COLOR[m.outcome] || '#555555'
    const now = new Date()

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
      Title: `Mission Report #${String(m.id).padStart(6, '0')}`,
      Author: 'B&E Consult FZCO — MyDD',
    }})

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="mission-report-${String(m.id).padStart(6, '0')}.pdf"`)
    doc.pipe(res)

    const W = 595.28  // A4 width in pt
    const M = 48      // side margin

    // ── Header bar ────────────────────────────────────────────
    doc.rect(0, 0, W, 36).fill(accentColor)
    doc.fontSize(7).fillColor('#ffffff').font('Helvetica-Bold')
       .text('B&E CONSULT FZCO — PAC AUDIT REPORT', M, 14, { align: 'center', width: W - M * 2, characterSpacing: 1.5 })

    // ── Logo + date ────────────────────────────────────────────
    let y = 52
    doc.roundedRect(M, y, 32, 32, 5).fill(accentColor)
    doc.fontSize(14).fillColor('#111111').font('Helvetica-Bold').text('M', M, y + 9, { width: 32, align: 'center' })

    doc.fontSize(13).fillColor('#111111').font('Helvetica-Bold').text('MyDD', M + 40, y + 4)
    doc.fontSize(7).fillColor('#999999').font('Helvetica').text('MY DUE DILIGENCE', M + 40, y + 20, { characterSpacing: 1 })

    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    doc.fontSize(8).fillColor('#aaaaaa').font('Helvetica').text('Report Date', 0, y + 4, { align: 'right', width: W - M })
    doc.fontSize(9).fillColor('#333333').font('Helvetica').text(dateStr, 0, y + 16, { align: 'right', width: W - M })

    // ── Company title ──────────────────────────────────────────
    y = 110
    doc.fontSize(7.5).fillColor('#aaaaaa').font('Helvetica').text('FIELD AUDIT REPORT', 0, y, { align: 'center', width: W, characterSpacing: 1.8 })
    y += 14
    doc.fontSize(20).fillColor('#111111').font('Helvetica-Bold').text(m.company_name || `Company #${m.company_id}`, 0, y, { align: 'center', width: W })
    y += 28
    if (m.location) {
      doc.fontSize(9).fillColor('#888888').font('Helvetica').text(m.location, 0, y, { align: 'center', width: W })
      y += 14
    }

    // ── Divider ────────────────────────────────────────────────
    y += 8
    const divX = W / 2 - 28
    doc.rect(divX, y, 56, 2).fill(accentColor)
    y += 16

    // ── Outcome badge ──────────────────────────────────────────
    if (m.outcome) {
      const OUTCOME_LABEL = { pass: 'PASS', fail: 'FAIL', conditional: 'CONDITIONAL' }
      const badgeW = m.outcome === 'conditional' ? 140 : 100
      const badgeX = (W - badgeW) / 2
      doc.roundedRect(badgeX, y, badgeW, 34, 6).fillAndStroke('#ffffff', accentColor)
      doc.fontSize(16).fillColor(accentColor).font('Helvetica-Bold')
         .text(OUTCOME_LABEL[m.outcome] || m.outcome.toUpperCase(), badgeX, y + 9, { align: 'center', width: badgeW })
      y += 52
    }

    // ── Details table ──────────────────────────────────────────
    const tableRows = [
      ['Mission ID', `#${String(m.id).padStart(5, '0')}`],
      ['Type', m.type ? m.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'],
      ['Status', (m.status || '').toUpperCase()],
      ['Assigned Agent', m.pacAgentName || '—'],
      ['Completed On', m.completedAt ? new Date(m.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'],
      ['Fee', m.fee ? `$${m.fee} USD` : '—'],
    ]
    const colW = (W - M * 2) / 2
    doc.roundedRect(M, y, W - M * 2, tableRows.length * 22, 4).fill('#f9f9f9')
    tableRows.forEach(([label, val], i) => {
      const rowY = y + i * 22 + 6
      if (i > 0) doc.moveTo(M + 8, y + i * 22).lineTo(W - M - 8, y + i * 22).stroke('#eeeeee')
      doc.fontSize(8.5).fillColor('#999999').font('Helvetica').text(label, M + 10, rowY, { width: colW - 10 })
      doc.fontSize(8.5).fillColor('#333333').font('Helvetica-Bold').text(val, M + colW, rowY, { width: colW - 10, align: 'right' })
    })
    y += tableRows.length * 22 + 16

    // ── Mission scope ──────────────────────────────────────────
    if (m.description) {
      doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('MISSION SCOPE', M, y, { characterSpacing: 1.5 })
      y += 12
      doc.fontSize(9).fillColor('#444444').font('Helvetica').text(m.description, M, y, { width: W - M * 2, lineGap: 3 })
      y += doc.heightOfString(m.description, { width: W - M * 2, lineGap: 3 }) + 14
    }

    // ── Audit findings ─────────────────────────────────────────
    if (m.reportText) {
      doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('AUDIT FINDINGS', M, y, { characterSpacing: 1.5 })
      y += 12
      doc.fontSize(9).fillColor('#222222').font('Helvetica').text(m.reportText, M, y, { width: W - M * 2, lineGap: 3 })
      y += doc.heightOfString(m.reportText, { width: W - M * 2, lineGap: 3 }) + 20
    }

    // ── Signatures ─────────────────────────────────────────────
    doc.moveTo(M, y).lineTo(W - M, y).stroke('#eeeeee')
    y += 12
    doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('PAC AGENT', M, y, { characterSpacing: 1.2 })
    doc.fontSize(7).fillColor('#aaaaaa').font('Helvetica').text('ISSUED BY', W / 2, y, { align: 'right', width: W / 2 - M, characterSpacing: 1.2 })
    y += 12
    doc.fontSize(9).fillColor('#333333').font('Helvetica-Bold').text(m.pacAgentName || 'B&E PAC Agent', M, y)
    doc.fontSize(9).fillColor('#333333').font('Helvetica-Bold').text('B&E Consult FZCO', W / 2, y, { align: 'right', width: W / 2 - M })
    if (m.pacLocation) {
      y += 13
      doc.fontSize(8).fillColor('#aaaaaa').font('Helvetica').text(m.pacLocation, M, y)
    }

    // ── Footer ─────────────────────────────────────────────────
    const pageH = 841.89
    doc.rect(0, pageH - 30, W, 30).fill('#111111')
    doc.fontSize(7).fillColor('#555555').font('Helvetica')
       .text(`© ${now.getFullYear()} B&E Consult FZCO · mydd.work`, M, pageH - 19)
    doc.fontSize(7).fillColor('#444444').font('Helvetica')
       .text(`REPORT-${String(m.id).padStart(6, '0')} · Confidential`, 0, pageH - 19, { align: 'right', width: W - M })

    doc.end()
  } catch (err) {
    console.error('PDF generation error:', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed' })
  }
})

app.get('/api/pac/profile', auth, async (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  try {
    const result = await query('SELECT * FROM pac_profiles WHERE user_id = $1 LIMIT 1', [req.user.id])
    const row = result.rows[0] || null
    res.json(row ? {
      name: row.full_name || '',
      location: row.location || '',
      languages: row.languages || '',
      certifications: row.certifications || '',
      bio: row.bio || '',
    } : {})
  } catch (err) {
    console.error('PAC profile get error:', err.message)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

app.post('/api/pac/profile', auth, async (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  try {
    const { name, location, languages, certifications, bio } = req.body
    await query(
      `INSERT INTO pac_profiles (user_id, full_name, location, languages, certifications, bio, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name      = EXCLUDED.full_name,
         location       = EXCLUDED.location,
         languages      = EXCLUDED.languages,
         certifications = EXCLUDED.certifications,
         bio            = EXCLUDED.bio,
         updated_at     = NOW()`,
      [req.user.id, name || null, location || null, languages || null, certifications || null, bio || null]
    )
    res.json({ message: 'Profile saved' })
    logAudit(req.user.id, 'pac_profile_update', 'pac_profiles', req.ip, { name, location })
  } catch (err) {
    console.error('PAC profile save error:', err.message)
    res.status(500).json({ error: 'Failed to save profile' })
  }
})

app.post('/api/pac/missions/:id/accept', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const missionId = parseInt(req.params.id, 10)
    if (Number.isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const result = await query(
      `UPDATE missions
       SET assigned_to = $1, status = 'assigned'
       WHERE id = $2 AND status = 'available'
       RETURNING *`,
      [req.user.id, missionId]
    )

    const mission = mapMissionRow(result.rows[0])
    if (!mission) return res.status(404).json({ error: 'Mission not found or already assigned' })
    res.json({ message: 'Mission accepted', mission })
    logAudit(req.user.id, 'mission_accepted', 'missions', req.ip, { missionId })
    // Email confirmation to PAC agent (fire-and-forget)
    const pacUser = await query('SELECT name, email FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    const pac = pacUser.rows[0] || {}
    sendMissionAssigned({
      email: pac.email,
      name:  pac.name,
      companyName: mission.company_name,
      location:    mission.location,
      fee:         mission.fee,
      missionId:   mission.id,
    }).catch(() => {})
  } catch (err) {
    console.error('Accept mission error:', err.message)
    res.status(500).json({ error: 'Failed to accept mission' })
  }
})

// POST /api/pac/missions/:id/complete — PAC agent submits inspection report
app.post('/api/pac/missions/:id/complete', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const missionId = parseInt(req.params.id, 10)
    if (Number.isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const { report_text, outcome } = req.body
    const VALID_OUTCOMES = ['pass', 'fail', 'conditional']
    if (!report_text || !outcome || !VALID_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: 'report_text and outcome (pass|fail|conditional) are required' })
    }

    const result = await query(
      `UPDATE missions
       SET status = 'completed', report_text = $1, outcome = $2, completed_at = NOW()
       WHERE id = $3 AND assigned_to = $4 AND status = 'assigned'
       RETURNING *`,
      [report_text, outcome, missionId, req.user.id]
    )

    const mission = mapMissionRow(result.rows[0])
    if (!mission) return res.status(404).json({ error: 'Mission not found or not assigned to you' })
    res.json({ message: 'Mission completed', mission })
    logAudit(req.user.id, 'mission_completed', 'missions', req.ip, { missionId, outcome })

    // Notify company user via email (fire-and-forget)
    const companyUserQ = await query(
      `SELECT u.name, u.email FROM users u
       JOIN companies c ON c.user_id = u.id
       WHERE c.id = $1 LIMIT 1`,
      [mission.company_id]
    )
    const companyUser = companyUserQ.rows[0] || {}
    sendMissionCompleted({
      email:       companyUser.email,
      name:        companyUser.name,
      companyName: mission.company_name,
      outcome,
      missionId:   mission.id,
    }).catch(() => {})
  } catch (err) {
    console.error('Complete mission error:', err.message)
    res.status(500).json({ error: 'Failed to complete mission' })
  }
})

// PATCH /api/admin/missions/:id/status — admin can update mission status
app.patch('/api/admin/missions/:id/status', auth, requireAdmin, async (req, res) => {
  try {
    const missionId = parseInt(req.params.id, 10)
    const { status } = req.body
    const VALID = ['available', 'assigned', 'completed', 'cancelled']
    if (Number.isNaN(missionId) || !VALID.includes(status)) {
      return res.status(400).json({ error: 'Invalid mission id or status' })
    }
    const result = await query(
      'UPDATE missions SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, missionId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Mission not found' })
    logAudit(req.user.id, 'admin_mission_status_update', 'missions', req.ip, { missionId, status })
    res.json({ mission: result.rows[0] })
  } catch (err) {
    console.error('Admin mission status error:', err.message)
    res.status(500).json({ error: 'Update failed' })
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

// ─── Forgot / Reset Password ──────────────────────────────────────────────────
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Try again later.' },
})

app.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
  // Always return 200 to prevent email enumeration
  res.json({ message: 'If this email is registered you will receive a reset link.' })
  try {
    const emailStr = String(req.body?.email || '').trim().toLowerCase()
    if (!emailStr) return

    const userResult = await query('SELECT id, name, email FROM users WHERE email = $1 LIMIT 1', [emailStr])
    if (!userResult.rows.length) return

    const user = userResult.rows[0]
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO NOTHING`,
      [user.id, tokenHash, expiresAt]
    )

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const resetUrl = `${frontendUrl}/reset-password/${rawToken}`
    sendPasswordReset({ email: user.email, name: user.name, resetUrl }).catch(() => {})
  } catch (err) {
    console.error('Forgot password error:', err.message)
  }
})

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Try again later.' },
})

app.post('/api/auth/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' })
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    if (String(password).length > 128) return res.status(400).json({ error: 'Password too long' })

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')
    const result = await query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
       LIMIT 1`,
      [tokenHash]
    )
    if (!result.rows.length) return res.status(400).json({ error: 'Reset link is invalid or expired' })

    const { id: prtId, user_id } = result.rows[0]
    const hash = await bcrypt.hash(String(password), 10)

    await Promise.all([
      query('UPDATE users SET password = $1 WHERE id = $2', [hash, user_id]),
      query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [prtId]),
      // Revoke all active refresh tokens for this user (force re-login everywhere)
      query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [user_id]),
    ])

    logAudit(user_id, 'password_reset', 'users', req.ip, {})
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    console.error('Reset password error:', err.message)
    res.status(500).json({ error: 'Reset failed' })
  }
})

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/stats', auth, requireAdmin, async (req, res) => {
  try {
    const [users, companies, revenue] = await Promise.all([
      query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL \'30d\')::int AS last_30d FROM users'),
      query('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE certification_level > 0)::int AS certified FROM companies'),
      query('SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status = \'completed\'), 0)::bigint AS total_cents FROM payments'),
    ])
    res.json({
      users:     users.rows[0],
      companies: companies.rows[0],
      revenue:   { total_usd: (Number(revenue.rows[0].total_cents) / 100).toFixed(2) },
    })
  } catch (err) {
    console.error('Admin stats error:', err.message)
    res.status(500).json({ error: 'Failed to load stats' })
  }
})

app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit
    const search = String(req.query.q || '').trim()

    let rowsResult, totalResult
    if (search) {
      const like = `%${search}%`
      rowsResult  = await query(`SELECT id, name, email, role, created_at, last_login FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY id DESC LIMIT $2 OFFSET $3`, [like, limit, offset])
      totalResult = await query(`SELECT COUNT(*)::int AS total FROM users WHERE name ILIKE $1 OR email ILIKE $1`, [like])
    } else {
      rowsResult  = await query(`SELECT id, name, email, role, created_at, last_login FROM users ORDER BY id DESC LIMIT $1 OFFSET $2`, [limit, offset])
      totalResult = await query(`SELECT COUNT(*)::int AS total FROM users`)
    }

    const total = totalResult.rows[0]?.total || 0
    res.json({ data: rowsResult.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } })
  } catch (err) {
    console.error('Admin users error:', err.message)
    res.status(500).json({ error: 'Failed to load users' })
  }
})

app.get('/api/admin/companies', auth, requireAdmin, async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit
    const search = String(req.query.q || '').trim()

    let rowsResult, totalResult
    if (search) {
      const like = `%${search}%`
      rowsResult  = await query(`SELECT c.id, c.company_name, c.name, c.country, c.sector, c.industry, c.certification_level, c.status, c.created_at, u.email FROM companies c LEFT JOIN users u ON u.id = c.user_id WHERE c.company_name ILIKE $1 OR c.name ILIKE $1 OR u.email ILIKE $1 ORDER BY c.id DESC LIMIT $2 OFFSET $3`, [like, limit, offset])
      totalResult = await query(`SELECT COUNT(*)::int AS total FROM companies c LEFT JOIN users u ON u.id = c.user_id WHERE c.company_name ILIKE $1 OR c.name ILIKE $1 OR u.email ILIKE $1`, [like])
    } else {
      rowsResult  = await query(`SELECT c.id, c.company_name, c.name, c.country, c.sector, c.industry, c.certification_level, c.status, c.created_at, u.email FROM companies c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT $1 OFFSET $2`, [limit, offset])
      totalResult = await query(`SELECT COUNT(*)::int AS total FROM companies`)
    }

    const total = totalResult.rows[0]?.total || 0
    res.json({ data: rowsResult.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } })
  } catch (err) {
    console.error('Admin companies error:', err.message)
    res.status(500).json({ error: 'Failed to load companies' })
  }
})

app.patch('/api/admin/companies/:id/level', auth, requireAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    const level = parseInt(req.body?.level, 10)
    if (Number.isNaN(companyId) || Number.isNaN(level) || level < 0 || level > 3) {
      return res.status(400).json({ error: 'Invalid company id or level (0-3)' })
    }
    const result = await query(
      `UPDATE companies SET certification_level = $1, updated_at = NOW()
        WHERE id = $2
       RETURNING id, company_name, certification_level, user_id`,
      [level, companyId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' })
    const company = result.rows[0]
    logAudit(req.user.id, 'admin_set_cert_level', 'companies', req.ip, { companyId, level })

    // Fire cert-granted email + in-app WS notification (non-blocking) when level is promoted to > 0
    if (level > 0 && company.user_id) {
      notifyUser(company.user_id, { type: 'cert_granted', level, companyId })
      query('SELECT email, name FROM users WHERE id = $1 LIMIT 1', [company.user_id])
        .then(({ rows }) => {
          if (!rows.length) return
          const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
          sendCertGranted({
            email:       rows[0].email,
            name:        rows[0].name,
            companyName: company.company_name,
            level,
            verifyUrl:   `${frontendUrl}/verify/${companyId}`,
          }).catch(() => {})
        })
        .catch(() => {})
    }

    res.json({ company })
  } catch (err) {
    console.error('Admin set level error:', err.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

// PATCH /api/admin/companies/:id/suspend — toggle company suspension
app.patch('/api/admin/companies/:id/suspend', auth, requireAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const { suspend, reason } = req.body
    const isSuspend = Boolean(suspend)
    const result = await query(
      `UPDATE companies
          SET suspended_at     = ${isSuspend ? 'NOW()' : 'NULL'},
              suspended_reason = ${isSuspend ? '$2' : 'NULL'},
              updated_at       = NOW()
        WHERE id = $1
       RETURNING id, company_name, suspended_at, suspended_reason`,
      isSuspend ? [companyId, String(reason || '').slice(0, 500)] : [companyId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' })
    logAudit(req.user.id, isSuspend ? 'admin_suspend_company' : 'admin_unsuspend_company', 'companies', req.ip, { companyId, reason })
    res.json({ company: result.rows[0] })
  } catch (err) {
    console.error('Suspend company error:', err.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

app.get('/api/admin/missions', auth, requireAdmin, async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit

    const [rowsResult, totalResult] = await Promise.all([
      query(`SELECT m.*, u.name AS pac_name, u.email AS pac_email
             FROM missions m
             LEFT JOIN users u ON u.id = m.assigned_to
             ORDER BY m.id DESC LIMIT $1 OFFSET $2`, [limit, offset]),
      query('SELECT COUNT(*)::int AS total FROM missions'),
    ])

    const total = totalResult.rows[0]?.total || 0
    res.json({ data: rowsResult.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } })
  } catch (err) {
    console.error('Admin missions error:', err.message)
    res.status(500).json({ error: 'Failed to load missions' })
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
  // Authenticate via ?token= query param (JWT in URL is acceptable for WS — short-lived 15m token)
  let wsUserId = null
  try {
    const qs = new URL(req.url, 'http://localhost').searchParams
    const token = qs.get('token')
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
