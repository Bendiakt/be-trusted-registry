'use strict'

const express   = require('express')
const rateLimit = require('express-rate-limit')
const router    = express.Router()

const { query }              = require('../db')
const { auth }               = require('../lib/authUtils')
const { mapCompanyRow }      = require('../lib/mappers')
const { logAudit }           = require('../lib/audit')
const { checkFraud }         = require('../lib/fraudDetection')
const { computeTrustScore }  = require('../lib/trustScore')
const { validate, schemas }  = require('../lib/validators')

const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
})

// Company profile write actions: register + apply (expensive fraud check + DB write)
const companyWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `company:write:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many company profile submissions. Please wait.' },
})

// Auth'd reads (list, me, mine) — generous
const companyReadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `company:read:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many requests.' },
})

// ── GET /api/companies — paginated list (auth required) ───────────────────────
router.get('/', auth, companyReadLimiter, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 100)
    const offset = (page - 1) * limit
    const search = String(req.query.search || '').trim()

    let rowsResult, totalResult
    if (search) {
      const like   = `%${search}%`
      rowsResult   = await query(
        `SELECT * FROM companies
         WHERE company_name ILIKE $1 OR name ILIKE $1 OR country ILIKE $1 OR sector ILIKE $1
         ORDER BY id DESC LIMIT $2 OFFSET $3`,
        [like, limit, offset],
      )
      totalResult  = await query(
        `SELECT COUNT(*)::int AS total FROM companies
         WHERE company_name ILIKE $1 OR name ILIKE $1 OR country ILIKE $1 OR sector ILIKE $1`,
        [like],
      )
    } else {
      rowsResult  = await query('SELECT * FROM companies ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset])
      totalResult = await query('SELECT COUNT(*)::int AS total FROM companies')
    }

    const total = totalResult.rows[0]?.total || 0
    res.json({
      data:       rowsResult.rows.map(mapCompanyRow),
      pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
    })
  } catch (err) {
    console.error('List companies error:', err.message)
    res.status(500).json({ error: 'Failed to load companies' })
  }
})

// ── GET /api/companies/me — current user's company + certInfo ─────────────────
router.get('/me', auth, companyReadLimiter, async (req, res) => {
  try {
    const companyResult = await query('SELECT * FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    const companyRow    = companyResult.rows[0]
    const company       = mapCompanyRow(companyRow)

    let certInfo = null
    if (companyRow?.id) {
      const certResult = await query(
        `SELECT level, status, granted_at, expires_at
         FROM certifications
         WHERE company_id = $1 AND status IN ('active', 'submitted')
         ORDER BY level DESC, id DESC LIMIT 1`,
        [companyRow.id],
      )
      if (certResult.rows.length > 0) {
        const c        = certResult.rows[0]
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
    }

    const userRow = await query('SELECT id, name, email, role, email_verified FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    const u       = userRow.rows[0] || req.user
    res.json({
      company: company ? { ...company, certInfo } : null,
      user:    { id: u.id, name: u.name, email: u.email, role: u.role, emailVerified: u.email_verified ?? false },
    })
  } catch (err) {
    console.error('My company error:', err.message)
    res.status(500).json({ error: 'Failed to load profile' })
  }
})

// ── GET /api/companies/mine — alias ──────────────────────────────────────────
router.get('/mine', auth, companyReadLimiter, async (req, res) => {
  try {
    const companyResult = await query('SELECT * FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    res.json(mapCompanyRow(companyResult.rows[0]) || null)
  } catch (err) {
    console.error('Mine company error:', err.message)
    res.status(500).json({ error: 'Failed to load company' })
  }
})

// ── POST /api/companies/register — create or update company profile ───────────
router.post('/register', auth, companyWriteLimiter, validate(schemas.createCompany), async (req, res) => {
  try {
    const { name, industry, sector, country, description, website } = req.body
    if (!name) return res.status(400).json({ error: 'Company name is required' })

    const userVerifyRow = await query('SELECT email_verified FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    if (!userVerifyRow.rows[0]?.email_verified) {
      return res.status(403).json({ error: 'Please verify your email address before creating a company profile.' })
    }

    const companyName = String(name).trim().slice(0, 200)
    if (companyName.length < 2) return res.status(400).json({ error: 'Company name too short' })

    const clean = (v, max = 100) => (v || '').toString().trim().slice(0, max) || null
    // Store industry and sector independently — sector preferred, fallback to industry
    const cleanIndustry = clean(industry)
    const cleanSector   = clean(sector) || cleanIndustry  // sector shown publicly; inherit from industry if blank

    let cleanWebsite = null
    if (website) {
      const w = String(website).trim().slice(0, 500)
      if (w && !/^https?:\/\/.+/i.test(w)) return res.status(400).json({ error: 'Website must start with http:// or https://' })
      cleanWebsite = w || null
    }

    const result = await query(
      `INSERT INTO companies (user_id, name, company_name, industry, sector, country, description, website, status, certification_level)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, 'pending', 0)
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name, company_name = EXCLUDED.company_name,
         industry = EXCLUDED.industry, sector = EXCLUDED.sector,
         country = EXCLUDED.country, description = EXCLUDED.description,
         website = EXCLUDED.website, updated_at = NOW()
       RETURNING *`,
      [req.user.id, companyName, cleanIndustry, cleanSector, clean(country), clean(description, 2000), cleanWebsite],
    )

    res.json({ company: mapCompanyRow(result.rows[0]) })
    logAudit(req.user.id, 'company_profile_update', 'companies', req.ip, { name, industry: cleanIndustry, sector: cleanSector, country })
    checkFraud({ userId: req.user.id, email: req.user.email, ip: req.ip, action: 'company_profile_update', companyId: result.rows[0].id }).catch(() => {})
    computeTrustScore(req.user.id).catch(() => {})
  } catch (err) {
    console.error('Register company error:', err.message)
    res.status(500).json({ error: 'Save failed' })
  }
})

// ── POST /api/companies/apply — legacy endpoint ───────────────────────────────
router.post('/apply', auth, companyWriteLimiter, validate(schemas.updateCompany), async (req, res) => {
  try {
    const { companyName, country, sector, website } = req.body

    const userVerifyRow = await query('SELECT email_verified FROM users WHERE id = $1 LIMIT 1', [req.user.id])
    if (!userVerifyRow.rows[0]?.email_verified) {
      return res.status(403).json({ error: 'Please verify your email address before creating a company profile.' })
    }

    const existing = await query('SELECT id FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Application already submitted' })

    let applyWebsite = null
    if (website) {
      const w = String(website).trim().slice(0, 500)
      if (w && !/^https?:\/\/.+/i.test(w)) return res.status(400).json({ error: 'Website must start with http:// or https://' })
      applyWebsite = w || null
    }

    const result = await query(
      `INSERT INTO companies (user_id, name, company_name, industry, sector, country, website, status, certification_level)
       VALUES ($1, $2, $2, $3, $3, $4, $5, 'pending', 0) RETURNING *`,
      [req.user.id, companyName || null, sector || null, country || null, applyWebsite],
    )
    res.json(mapCompanyRow(result.rows[0]))
  } catch (err) {
    console.error('Legacy apply error:', err.message)
    res.status(500).json({ error: 'Application failed' })
  }
})

// ── GET /api/verify/:id — public company verification ────────────────────────
router.get('/verify/:id', publicReadLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const result  = await query('SELECT * FROM companies WHERE id = $1 LIMIT 1', [companyId])
    const company = mapCompanyRow(result.rows[0])
    if (!company) return res.status(404).json({ error: 'Company not found' })

    let certInfo = null
    const certResult = await query(
      `SELECT level, status, granted_at, expires_at FROM certifications
       WHERE company_id = $1 AND status IN ('active', 'submitted')
       ORDER BY level DESC, id DESC LIMIT 1`,
      [companyId],
    )
    if (certResult.rows.length > 0) {
      const c        = certResult.rows[0]
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

// ── GET /api/registry — public certified supplier search (via companiesRouter, NOT active) ──
router.get('/registry', publicReadLimiter, async (req, res) => {
  try {
    const page    = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit   = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 100)
    const offset  = (page - 1) * limit
    const search  = String(req.query.q || req.query.search || '').trim()
    const country = String(req.query.country || '').trim()
    const level   = parseInt(req.query.level || '0', 10) || 0

    const conditions = ['certification_level > 0']
    const params     = []
    let pi           = 1

    if (search)  { conditions.push(`(company_name ILIKE $${pi} OR name ILIKE $${pi} OR sector ILIKE $${pi} OR industry ILIKE $${pi})`); params.push(`%${search}%`); pi++ }
    if (country) { conditions.push(`country ILIKE $${pi}`);              params.push(`%${country}%`); pi++ }
    if (level > 0) { conditions.push(`certification_level >= $${pi}`);   params.push(level); pi++ }

    const where = conditions.join(' AND ')
    const [rowsResult, totalResult] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.company_name, c.sector, c.industry, c.country, c.website,
                c.certification_level, c.status,
                ts.score AS trust_score, ts.risk_level AS trust_risk
         FROM companies c
         LEFT JOIN LATERAL (
           SELECT score, risk_level FROM trust_scores WHERE company_id = c.id ORDER BY computed_at DESC LIMIT 1
         ) ts ON TRUE
         WHERE ${where}
         ORDER BY c.certification_level DESC, c.id DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limit, offset],
      ),
      query(`SELECT COUNT(*)::int AS total FROM companies WHERE ${where}`, params),
    ])

    const total = totalResult.rows[0]?.total || 0
    // Public registry is cacheable for 60 s; CDN can serve stale for 5 min while revalidating
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
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

// ── GET /api/companies/missions — company-side view of their PAC missions ─────
router.get('/missions', auth, companyReadLimiter, async (req, res) => {
  try {
    // Only company role; return empty for others (graceful)
    if (req.user.role !== 'company') return res.json({ missions: [], pagination: { page: 1, limit: 20, total: 0, pages: 1 } })

    const compResult = await query('SELECT id FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    if (!compResult.rows.length) return res.json({ missions: [], pagination: { page: 1, limit: 20, total: 0, pages: 1 } })

    const companyId = compResult.rows[0].id
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10))
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)))
    const offset = (page - 1) * limit

    const [result, countResult] = await Promise.all([
      query(
        `SELECT m.id, m.status, m.outcome, m.report_text,
                m.location, m.type, m.description,
                m.created_at, m.completed_at,
                pp.full_name AS pac_name,
                pp.location  AS pac_location
           FROM missions m
           LEFT JOIN pac_profiles pp ON pp.user_id = m.assigned_to
          WHERE m.company_id = $1
          ORDER BY m.created_at DESC
          LIMIT $2 OFFSET $3`,
        [companyId, limit, offset],
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM missions WHERE company_id = $1`,
        [companyId],
      ),
    ])

    const total = countResult.rows[0]?.total || 0
    res.json({
      missions: result.rows.map(r => ({
        id:          r.id,
        status:      r.status,
        outcome:     r.outcome      || null,
        reportText:  r.report_text  || null,
        location:    r.location     || '',
        type:        r.type         || '',
        description: r.description  || '',
        createdAt:   r.created_at,
        completedAt: r.completed_at || null,
        pacName:     r.pac_name     || null,
        pacLocation: r.pac_location || null,
      })),
      pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
    })
  } catch (err) {
    console.error('Company missions error:', err.message)
    res.status(500).json({ error: 'Failed to load missions' })
  }
})

module.exports = router
