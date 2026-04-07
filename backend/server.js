require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const app = express()
app.use(cors())
const jsonMiddleware = express.json()
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payments/webhook') return next()
  return jsonMiddleware(req, res, next)
})

const { router: paymentsRouter, setCompanies } = require('./routes/payments')
app.use('/api/payments', paymentsRouter)

const SECRET = process.env.JWT_SECRET || 'be-registry-secret-2024'
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

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try { req.user = jwt.verify(token, SECRET); next() }
  catch { res.status(401).json({ error: 'Invalid token' }) }
}

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

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.listen(process.env.PORT || 5000, () => console.log(`Backend running on port ${process.env.PORT || 5000}`))
