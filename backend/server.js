require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const app = express()
app.use(cors())

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

const SECRET = process.env.JWT_SECRET || 'be-registry-secret-2024'

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try { req.user = jwt.verify(token, SECRET); next() }
  catch { res.status(401).json({ error: 'Invalid token' }) }
}

const { router: paymentsRouter, setCompanies } = require('./routes/payments')
app.post('/api/payments/create-checkout-session', auth)
app.use('/api/payments', paymentsRouter)

const users = []
const companies = []
const missions = []

// Pass companies array to payments router
setCompanies(companies)

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role } = req.body
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' })
  if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already exists' })
  const hash = await bcrypt.hash(password, 10)
  const user = { id: users.length + 1, name, email, password: hash, role: role || 'company' }
  users.push(user)
  res.json({ message: 'Registered successfully' })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  const user = users.find(u => u.email === email)
  if (!user) return res.status(400).json({ error: 'Invalid credentials' })
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' })
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } })
})

app.get('/api/companies', auth, (req, res) => res.json(companies))

app.post('/api/companies/apply', auth, (req, res) => {
  const { companyName, country, sector, website } = req.body
  if (companies.find(c => c.userId === req.user.id)) return res.status(400).json({ error: 'Application already submitted' })
  const company = { id: companies.length + 1, userId: req.user.id, companyName, country, sector, website, status: 'pending', level: 0, badge: 'not-certified', createdAt: new Date().toISOString() }
  companies.push(company)
  res.json(company)
})

app.get('/api/companies/mine', auth, (req, res) => {
  const company = companies.find(c => c.userId === req.user.id)
  res.json(company || null)
})

app.get('/api/verify/:id', (req, res) => {
  const company = companies.find(c => c.id === parseInt(req.params.id))
  if (!company) return res.status(404).json({ error: 'Company not found' })
  res.json(company)
})

app.get('/api/pac/missions', auth, (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  res.json(missions)
})

app.post('/api/pac/profile', auth, (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  res.json({ message: 'Profile saved', data: req.body })
})

app.post('/api/pac/missions/:id/accept', auth, (req, res) => {
  if (req.user.role !== 'pac') return res.status(403).json({ error: 'Forbidden' })
  const m = missions.find(x => x.id === parseInt(req.params.id))
  if (!m) return res.status(404).json({ error: 'Mission not found' })
  m.assigned_to = req.user.id
  m.status = 'accepted'
  res.json({ message: 'Mission accepted', mission: m })
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
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`))
