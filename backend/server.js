require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const http = require('http')
const { WebSocketServer } = require('ws')
const { hashForIntegrity } = require('./lib/encryption')
const { checkFraud } = require('./lib/fraudDetection')
const metricsRouter = require('./routes/metrics')
const { query, initDb } = require('./db')

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

app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS origin denied' })
  }
  return next(err)
})

// --- Metrics counters (initialised at startup) ---
const startTime = Date.now()
let requestCount = 0
let errorCount = 0
let totalLatency = 0

// Middleware: track every request for metrics + lightweight logging.
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const durationMs = Date.now() - start
    requestCount++
    totalLatency += durationMs
    if (res.statusCode >= 400) errorCount++
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    }))
  })
  next()
})

const jsonMiddleware = express.json()
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') return next()
  return jsonMiddleware(req, res, next)
})

const SECRET = process.env.JWT_SECRET
if (!SECRET) {
  throw new Error('Missing JWT_SECRET environment variable')
}

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try { req.user = jwt.verify(token, SECRET); next() }
  catch { res.status(401).json({ error: 'Invalid token' }) }
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const mapMissionRow = (row) => {
  if (!row) return null
  return {
    id: row.id,
    assigned_to: row.assigned_to,
    status: row.status,
    createdAt: row.created_at,
  }
}

const { router: paymentsRouter } = require('./routes/payments')
app.post('/api/payments/create-checkout-session', auth)
app.use('/api/payments', paymentsRouter)
app.use('/api/metrics', metricsRouter)

// Immutable audit trail helper — fire-and-forget (never blocks response)
const logAudit = (userId, action, resource, ip, payload) => {
  const hash = hashForIntegrity(payload || '')
  query(
    'INSERT INTO audit_log (user_id, action, resource, ip_address, payload_hash) VALUES ($1, $2, $3, $4, $5)',
    [userId || null, action, resource || null, ip || null, hash],
  ).catch(e => console.error('audit_log write failed:', e.message))
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' })

    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email])
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' })

    const hash = await bcrypt.hash(password, 10)
    await query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      [name, email, hash, role || 'company']
    )

  res.json({ message: 'Registered successfully' })
  logAudit(null, 'user_register', 'users', req.ip, { email, role: role || 'company' })
  await checkFraud({ userId: null, email, ip: req.ip, action: 'user_register' }).catch(() => {})
  } catch (err) {
    console.error('Register error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const userResult = await query('SELECT id, name, email, password, role FROM users WHERE email = $1 LIMIT 1', [email])
    const user = userResult.rows[0]
    if (!user) return res.status(400).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' })

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
  logAudit(user.id, 'user_login', 'users', req.ip, { email })
  } catch (err) {
    console.error('Login error:', err.message)
    res.status(500).json({ error: 'Login failed' })
  }
})

app.get('/api/companies', auth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM companies ORDER BY id DESC')
    res.json(result.rows.map(mapCompanyRow))
  } catch (err) {
    console.error('List companies error:', err.message)
    res.status(500).json({ error: 'Failed to load companies' })
  }
})

// Primary profile endpoint used by Dashboard
app.get('/api/companies/me', auth, async (req, res) => {
  try {
    const companyResult = await query('SELECT * FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    const company = mapCompanyRow(companyResult.rows[0])
    const { id, name, email, role } = req.user
    res.json({ company: company || null, user: { id, name, email, role } })
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
    const { name, industry, country, description } = req.body
    if (!name) return res.status(400).json({ error: 'Company name is required' })

    const result = await query(
      `INSERT INTO companies (user_id, name, company_name, industry, sector, country, description, status, certification_level)
       VALUES ($1, $2, $2, $3, $3, $4, $5, 'pending', 0)
       ON CONFLICT (user_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         company_name = EXCLUDED.company_name,
         industry = EXCLUDED.industry,
         sector = EXCLUDED.sector,
         country = EXCLUDED.country,
         description = EXCLUDED.description,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, name, industry || null, country || null, description || null]
    )

    res.json({ company: mapCompanyRow(result.rows[0]) })
    logAudit(req.user.id, 'company_profile_update', 'companies', req.ip, { name, industry, country })
    checkFraud({ userId: req.user.id, email: req.user.email, ip: req.ip, action: 'company_profile_update', companyId: result.rows[0].id }).catch(() => {})
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

    const result = await query(
      `INSERT INTO companies (
         user_id, name, company_name, industry, sector, country, website, status, certification_level
       ) VALUES ($1, $2, $2, $3, $3, $4, $5, 'pending', 0)
       RETURNING *`,
      [req.user.id, companyName || null, sector || null, country || null, website || null]
    )

    res.json(mapCompanyRow(result.rows[0]))
  } catch (err) {
    console.error('Legacy apply error:', err.message)
    res.status(500).json({ error: 'Application failed' })
  }
})

app.get('/api/verify/:id', async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const result = await query('SELECT * FROM companies WHERE id = $1 LIMIT 1', [companyId])
    const company = mapCompanyRow(result.rows[0])
    if (!company) return res.status(404).json({ error: 'Company not found' })

    res.json(company)
  } catch (err) {
    console.error('Verify error:', err.message)
    res.status(500).json({ error: 'Verification failed' })
  }
})

app.get('/api/pac/missions', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const result = await query('SELECT * FROM missions ORDER BY id DESC')
    res.json(result.rows.map(mapMissionRow))
  } catch (err) {
    console.error('List missions error:', err.message)
    res.status(500).json({ error: 'Failed to load missions' })
  }
})

app.post('/api/pac/profile', auth, (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  res.json({ message: 'Profile saved', data: req.body })
})

app.post('/api/pac/missions/:id/accept', auth, async (req, res) => {
  try {
    if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
    const missionId = parseInt(req.params.id, 10)
    if (Number.isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })

    const result = await query(
      `UPDATE missions
       SET assigned_to = $1, status = 'accepted'
       WHERE id = $2
       RETURNING *`,
      [req.user.id, missionId]
    )

    const mission = mapMissionRow(result.rows[0])
    if (!mission) return res.status(404).json({ error: 'Mission not found' })
    res.json({ message: 'Mission accepted', mission })
  } catch (err) {
    console.error('Accept mission error:', err.message)
    res.status(500).json({ error: 'Failed to accept mission' })
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

// --- Prometheus-compatible metrics endpoint ---
app.get('/metrics', (req, res) => {
  const uptimeSec = (Date.now() - startTime) / 1000
  const mem = process.memoryUsage()
  const avgLatencyMs = requestCount > 0 ? totalLatency / requestCount : 0
  const errorRatePct = requestCount > 0 ? (errorCount / requestCount) * 100 : 0

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

  res.json({
    timestamp: new Date().toISOString(),
    uptime_ms: Date.now() - startTime,
    requests_total: requestCount,
    errors_total: errorCount,
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

const PORT = process.env.PORT || 8080

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws/metrics' })

const getBusinessMetrics = async () => {
  try {
    const [usersRes, companiesRes, certifiedRes, alertsRes, avgScoreRes, revenueRes] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM companies'),
      query('SELECT COUNT(*) FROM companies WHERE certification_level > 0'),
      query('SELECT COUNT(*) FROM fraud_alerts WHERE resolved = FALSE'),
      query("SELECT ROUND(AVG(score), 1) AS avg FROM trust_scores WHERE computed_at > NOW() - INTERVAL '7 days'"),
      query(`SELECT COALESCE(SUM(CASE certification_level WHEN 1 THEN 490 WHEN 2 THEN 990 WHEN 3 THEN 2490 ELSE 0 END), 0) AS total FROM companies WHERE certification_level > 0`),
    ])
    const usersTotal = parseInt(usersRes.rows[0].count, 10)
    const companiesTotal = parseInt(companiesRes.rows[0].count, 10)
    const certifiedTotal = parseInt(certifiedRes.rows[0].count, 10)
    return {
      timestamp: new Date().toISOString(),
      users_total: usersTotal,
      companies_total: companiesTotal,
      certified_total: certifiedTotal,
      cert_rate_pct: companiesTotal > 0 ? Math.round((certifiedTotal / companiesTotal) * 100) : 0,
      fraud_alerts_active: parseInt(alertsRes.rows[0].count, 10),
      avg_trust_score: parseFloat(avgScoreRes.rows[0].avg || 0),
      revenue_total_usd: parseFloat(revenueRes.rows[0].total),
      requests_total: requestCount,
    }
  } catch (e) {
    console.error('getBusinessMetrics error:', e.message)
    return null
  }
}

wss.on('connection', (ws) => {
  getBusinessMetrics().then(data => {
    if (data && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'metrics', data }))
    }
  }).catch(() => {})
})

const startServer = async () => {
  try {
    await initDb()
    server.listen(PORT, () => {
      console.log(`Backend running on port ${PORT}`)
      // Broadcast business metrics every 10 s to all connected WS clients
      setInterval(async () => {
        if (wss.clients.size === 0) return
        const data = await getBusinessMetrics()
        if (!data) return
        const msg = JSON.stringify({ type: 'metrics', data })
        for (const ws of wss.clients) {
          if (ws.readyState === 1) ws.send(msg)
        }
      }, 10_000)
    })
  } catch (err) {
    console.error('Failed to initialize backend:', err.message)
    process.exit(1)
  }
}

startServer()
