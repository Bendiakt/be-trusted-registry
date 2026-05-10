'use strict'

const express   = require('express')
const rateLimit = require('express-rate-limit')
const router    = express.Router()

const { query }                  = require('../db')
const { auth, requireAdmin }     = require('../lib/authUtils')
const { logAudit }               = require('../lib/audit')
const { notifyUser }             = require('../lib/wsNotify')
const { createNotification }     = require('../lib/notify')
const { sendCertGranted,
        sendCertRevoked }        = require('../lib/mailer')
const { isBlockedCompany }       = require('../lib/blocklist')

// ── Rate limiters ────────────────────────────────────────────────────────────
// Admin reads: generous since admins are few and trusted
const adminReadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `admin:read:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many requests.' },
})
// Admin writes: stricter to guard bulk mutations
const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `admin:write:${req.user?.id || req.ip}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many write requests.' },
})

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const [users, companies, revenue, alerts, docs, missions] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30d')::int AS last_30d,
                    COUNT(*) FILTER (WHERE email_verified = FALSE)::int AS unverified
             FROM users`),
      query(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE certification_level > 0)::int AS certified,
                    COUNT(*) FILTER (WHERE suspended_at IS NOT NULL)::int AS suspended
             FROM companies`),
      query(`SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status = 'completed'), 0)::bigint AS total_cents,
                    COUNT(*) FILTER (WHERE status = 'completed')::int AS total_payments
             FROM payments`),
      query(`SELECT COUNT(*) FILTER (WHERE resolved = FALSE)::int AS open_alerts FROM fraud_alerts`),
      query(`SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_docs FROM documents`),
      query(`SELECT COUNT(*) FILTER (WHERE status = 'available')::int AS open_missions FROM missions`),
    ])
    res.json({
      users:     users.rows[0],
      companies: companies.rows[0],
      revenue:   {
        total_usd:      (Number(revenue.rows[0].total_cents) / 100).toFixed(2),
        total_payments: revenue.rows[0].total_payments,
      },
      fraud:     { open_alerts:   alerts.rows[0].open_alerts },
      documents: { pending_docs:  docs.rows[0].pending_docs },
      missions:  { open_missions: missions.rows[0].open_missions },
    })
  } catch (err) {
    console.error('Admin stats error:', err.message)
    res.status(500).json({ error: 'Failed to load stats' })
  }
})

// ── GET /api/admin/users/:id — full user detail ───────────────────────────────
router.get('/users/:id', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10)
    if (Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' })

    const [userResult, companyResult, auditResult, fraudResult] = await Promise.all([
      query(`SELECT id, name, email, role, created_at, last_login, email_verified FROM users WHERE id = $1 LIMIT 1`, [userId]),
      query(`SELECT id, company_name, certification_level, status, country, sector, suspended_at FROM companies WHERE user_id = $1 LIMIT 1`, [userId]),
      query(`SELECT action, resource, ip_address, created_at FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]),
      query(`SELECT rule, severity, resolved, created_at FROM fraud_alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [userId]),
    ])

    if (!userResult.rows.length) return res.status(404).json({ error: 'User not found' })
    res.json({
      user:    userResult.rows[0],
      company: companyResult.rows[0] || null,
      recentAudit: auditResult.rows,
      fraudAlerts: fraudResult.rows,
    })
  } catch (err) {
    console.error('Admin user detail error:', err.message)
    res.status(500).json({ error: 'Failed to load user' })
  }
})

// ── PATCH /api/admin/users/:id/role ─────────────────────────────────────────
router.patch('/users/:id/role', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10)
    const { role } = req.body
    const VALID_ROLES = ['company', 'trader', 'pac', 'admin']
    if (Number.isNaN(userId) || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid user id or role' })
    }
    // Prevent admins from demoting themselves
    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own role' })
    }
    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role',
      [role, userId],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' })
    logAudit(req.user.id, 'admin_change_user_role', 'users', req.ip, { userId, role })
    res.json({ user: result.rows[0] })
  } catch (err) {
    console.error('Admin change role error:', err.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────
router.delete('/users/:id', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10)
    if (Number.isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' })
    if (userId === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' })

    // Soft-delete: anonymise PII rather than hard DELETE so audit log stays intact
    const result = await query(
      `UPDATE users
          SET name     = '[deleted]',
              email    = 'deleted_' || id || '@deleted.invalid',
              password = '',
              email_verified = FALSE,
              email_verify_token = NULL
        WHERE id = $1
       RETURNING id`,
      [userId],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' })
    // Revoke all active refresh tokens
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId])
    logAudit(req.user.id, 'admin_delete_user', 'users', req.ip, { userId })
    res.json({ message: 'User anonymised successfully' })
  } catch (err) {
    console.error('Admin delete user error:', err.message)
    res.status(500).json({ error: 'Delete failed' })
  }
})

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit
    const search = String(req.query.q || '').trim()

    let rowsResult, totalResult
    if (search) {
      const like   = `%${search}%`
      rowsResult   = await query(`SELECT id, name, email, role, created_at, last_login FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY id DESC LIMIT $2 OFFSET $3`, [like, limit, offset])
      totalResult  = await query(`SELECT COUNT(*)::int AS total FROM users WHERE name ILIKE $1 OR email ILIKE $1`, [like])
    } else {
      rowsResult   = await query(`SELECT id, name, email, role, created_at, last_login FROM users ORDER BY id DESC LIMIT $1 OFFSET $2`, [limit, offset])
      totalResult  = await query(`SELECT COUNT(*)::int AS total FROM users`)
    }
    const total = totalResult.rows[0]?.total || 0
    res.json({ data: rowsResult.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } })
  } catch (err) {
    console.error('Admin users error:', err.message)
    res.status(500).json({ error: 'Failed to load users' })
  }
})

// ── GET /api/admin/companies/:id — full company detail ───────────────────────
router.get('/companies/:id', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const [companyResult, certsResult, paymentsResult, trustResult, fraudResult, docsResult] = await Promise.all([
      query(`SELECT c.*, u.email, u.name AS owner_name, u.email_verified
             FROM companies c JOIN users u ON u.id = c.user_id
             WHERE c.id = $1 LIMIT 1`, [companyId]),
      query(`SELECT id, level, status, granted_at, expires_at, payment_confirmed, created_at
             FROM certifications WHERE company_id = $1 ORDER BY created_at DESC`, [companyId]),
      query(`SELECT id, amount_cents, currency, status, plan_id, created_at
             FROM payments WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10`, [companyId]),
      query(`SELECT score, risk_level, indicators, computed_at
             FROM trust_scores WHERE company_id = $1 ORDER BY computed_at DESC LIMIT 1`, [companyId]),
      query(`SELECT rule, severity, resolved, created_at
             FROM fraud_alerts WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10`, [companyId]),
      query(`SELECT id, original_name, doc_type, status, size_bytes, uploaded_at
             FROM documents WHERE company_id = $1 ORDER BY uploaded_at DESC`, [companyId]),
    ])

    if (!companyResult.rows.length) return res.status(404).json({ error: 'Company not found' })
    res.json({
      company:     companyResult.rows[0],
      certs:       certsResult.rows,
      payments:    paymentsResult.rows,
      trust:       trustResult.rows[0] || null,
      fraudAlerts: fraudResult.rows,
      documents:   docsResult.rows,
    })
  } catch (err) {
    console.error('Admin company detail error:', err.message)
    res.status(500).json({ error: 'Failed to load company' })
  }
})

// ── GET /api/admin/companies ──────────────────────────────────────────────────
router.get('/companies', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit
    const search = String(req.query.q || '').trim()

    let rowsResult, totalResult
    if (search) {
      const like   = `%${search}%`
      rowsResult   = await query(`SELECT c.id, c.company_name, c.name, c.country, c.sector, c.industry, c.certification_level, c.status, c.created_at, u.email FROM companies c LEFT JOIN users u ON u.id = c.user_id WHERE c.company_name ILIKE $1 OR c.name ILIKE $1 OR u.email ILIKE $1 ORDER BY c.id DESC LIMIT $2 OFFSET $3`, [like, limit, offset])
      totalResult  = await query(`SELECT COUNT(*)::int AS total FROM companies c LEFT JOIN users u ON u.id = c.user_id WHERE c.company_name ILIKE $1 OR c.name ILIKE $1 OR u.email ILIKE $1`, [like])
    } else {
      rowsResult   = await query(`SELECT c.id, c.company_name, c.name, c.country, c.sector, c.industry, c.certification_level, c.status, c.created_at, u.email FROM companies c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT $1 OFFSET $2`, [limit, offset])
      totalResult  = await query(`SELECT COUNT(*)::int AS total FROM companies`)
    }
    const total = totalResult.rows[0]?.total || 0
    res.json({ data: rowsResult.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } })
  } catch (err) {
    console.error('Admin companies error:', err.message)
    res.status(500).json({ error: 'Failed to load companies' })
  }
})

// ── PATCH /api/admin/companies/:id/level ─────────────────────────────────────
router.patch('/companies/:id/level', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    const level     = parseInt(req.body?.level, 10)
    if (Number.isNaN(companyId) || Number.isNaN(level) || level < 0 || level > 3) {
      return res.status(400).json({ error: 'Invalid company id or level (0-3)' })
    }
    const result = await query(
      `UPDATE companies SET certification_level = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, company_name, certification_level, user_id`,
      [level, companyId],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' })
    const company = result.rows[0]

    // Prevent certification of the platform operator's own entities
    if (level > 0 && isBlockedCompany(company.company_name)) {
      // Roll back — set level back to 0 silently
      await query('UPDATE companies SET certification_level = 0, updated_at = NOW() WHERE id = $1', [companyId])
      return res.status(403).json({ error: 'This company cannot be certified on this platform.' })
    }

    logAudit(req.user.id, 'admin_set_cert_level', 'companies', req.ip, { companyId, level })

    if (company.user_id) {
      if (level > 0) {
        notifyUser(company.user_id, { type: 'cert_granted', level, companyId })
        createNotification(company.user_id, {
          type:  'cert_granted',
          title: `Certification Level ${level} granted — ${company.company_name}`,
          body:  `Your company has been awarded MyDD Level ${level} certification.`,
          link:  '/dashboard',
        })
        query('SELECT email, name FROM users WHERE id = $1 LIMIT 1', [company.user_id])
          .then(({ rows }) => {
            if (!rows.length) return
            const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
            sendCertGranted({ email: rows[0].email, name: rows[0].name, companyName: company.company_name, level, verifyUrl: `${frontendUrl}/verify/${companyId}` }).catch(() => {})
          }).catch(() => {})
      } else {
        // Level set to 0 = certification revoked
        notifyUser(company.user_id, { type: 'cert_revoked', companyId })
        createNotification(company.user_id, {
          type:  'info',
          title: `Certification revoked — ${company.company_name}`,
          body:  'Your MyDD certification has been revoked. Contact support for details.',
          link:  '/dashboard',
        })
        query('SELECT email, name FROM users WHERE id = $1 LIMIT 1', [company.user_id])
          .then(({ rows }) => {
            if (!rows.length) return
            sendCertRevoked({ email: rows[0].email, name: rows[0].name, companyName: company.company_name }).catch(() => {})
          }).catch(() => {})
      }
    }
    res.json({ company })
  } catch (err) {
    console.error('Admin set level error:', err.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

// ── PATCH /api/admin/companies/:id/suspend ────────────────────────────────────
router.patch('/companies/:id/suspend', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const { suspend, reason } = req.body
    const isSuspend = Boolean(suspend)
    const result    = await query(
      `UPDATE companies
          SET suspended_at     = ${isSuspend ? 'NOW()' : 'NULL'},
              suspended_reason = ${isSuspend ? '$2' : 'NULL'},
              updated_at       = NOW()
        WHERE id = $1
       RETURNING id, company_name, suspended_at, suspended_reason`,
      isSuspend ? [companyId, String(reason || '').slice(0, 500)] : [companyId],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' })
    logAudit(req.user.id, isSuspend ? 'admin_suspend_company' : 'admin_unsuspend_company', 'companies', req.ip, { companyId, reason })
    res.json({ company: result.rows[0] })
  } catch (err) {
    console.error('Suspend company error:', err.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

// ── PATCH /api/admin/missions/:id/status ─────────────────────────────────────
router.patch('/missions/:id/status', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const missionId = parseInt(req.params.id, 10)
    const { status }  = req.body
    const VALID       = ['available', 'assigned', 'completed', 'cancelled']
    if (Number.isNaN(missionId) || !VALID.includes(status)) {
      return res.status(400).json({ error: 'Invalid mission id or status' })
    }
    const result = await query(
      'UPDATE missions SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, missionId],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Mission not found' })
    logAudit(req.user.id, 'admin_mission_status_update', 'missions', req.ip, { missionId, status })
    res.json({ mission: result.rows[0] })
  } catch (err) {
    console.error('Admin mission status error:', err.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

// ── GET /api/admin/missions ───────────────────────────────────────────────────
router.get('/missions', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit

    const [rowsResult, totalResult] = await Promise.all([
      query(`SELECT m.*, u.name AS pac_name, u.email AS pac_email
             FROM missions m LEFT JOIN users u ON u.id = m.assigned_to
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

// ── GET /api/admin/audit-log — paginated, filterable global audit trail ───────
router.get('/audit-log', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit
    const userId = req.query.user_id ? parseInt(req.query.user_id, 10) : null
    const action = String(req.query.action || '').trim()

    const conditions = []
    const params     = []

    if (userId && !Number.isNaN(userId)) {
      params.push(userId)
      conditions.push(`a.user_id = $${params.length}`)
    }
    if (action) {
      params.push(`%${action}%`)
      conditions.push(`a.action ILIKE $${params.length}`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const [rowsResult, totalResult] = await Promise.all([
      query(
        `SELECT a.id, a.user_id, a.action, a.resource, a.ip_address, a.created_at,
                u.name AS user_name, u.email AS user_email
           FROM audit_log a
           LEFT JOIN users u ON u.id = a.user_id
           ${where}
           ORDER BY a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM audit_log a ${where}`,
        params,
      ),
    ])
    const total = totalResult.rows[0]?.total || 0
    res.json({ data: rowsResult.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } })
  } catch (err) {
    console.error('Admin audit-log error:', err.message)
    res.status(500).json({ error: 'Failed to load audit log' })
  }
})

// ── GET /api/admin/fraud-alerts — all unresolved fraud alerts ─────────────────
router.get('/fraud-alerts', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const page     = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit    = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset   = (page - 1) * limit
    const resolved = req.query.resolved === 'true'

    const [rowsResult, totalResult] = await Promise.all([
      query(
        `SELECT f.id, f.user_id, f.company_id, f.rule, f.severity, f.resolved, f.created_at,
                u.name AS user_name, u.email AS user_email
           FROM fraud_alerts f
           LEFT JOIN users u ON u.id = f.user_id
           WHERE f.resolved = $1
           ORDER BY f.id DESC LIMIT $2 OFFSET $3`,
        [resolved, limit, offset],
      ),
      query('SELECT COUNT(*)::int AS total FROM fraud_alerts WHERE resolved = $1', [resolved]),
    ])
    const total = totalResult.rows[0]?.total || 0
    res.json({ data: rowsResult.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } })
  } catch (err) {
    console.error('Admin fraud-alerts error:', err.message)
    res.status(500).json({ error: 'Failed to load fraud alerts' })
  }
})

// ── PATCH /api/admin/fraud-alerts/:id/resolve ─────────────────────────────────
router.patch('/fraud-alerts/:id/resolve', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const alertId = parseInt(req.params.id, 10)
    if (Number.isNaN(alertId)) return res.status(400).json({ error: 'Invalid alert id' })
    const result = await query(
      'UPDATE fraud_alerts SET resolved = TRUE WHERE id = $1 RETURNING id, rule, resolved',
      [alertId],
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Alert not found' })
    logAudit(req.user.id, 'admin_resolve_fraud_alert', 'fraud_alerts', req.ip, { alertId })
    res.json({ alert: result.rows[0] })
  } catch (err) {
    console.error('Admin resolve alert error:', err.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

// ── GET /api/admin/documents — paginated queue of all documents ───────────────
// Optional filters: status (pending|approved|rejected), page, limit
router.get('/documents', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200)
    const offset = (page - 1) * limit
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null

    // Build separate param lists: main query uses $1=limit $2=offset [$3=status]
    // count query uses $1=status (if filtered) or no params
    const mainWhere  = status ? 'WHERE d.status = $3' : ''
    const mainParams = status ? [limit, offset, status] : [limit, offset]
    const cntWhere   = status ? 'WHERE d.status = $1' : ''
    const cntParams  = status ? [status] : []

    const [rowsResult, totalResult] = await Promise.all([
      query(
        `SELECT d.id, d.original_name, d.doc_type, d.status, d.size_bytes,
                d.review_note, d.uploaded_at, d.reviewed_at,
                c.id AS company_id, c.company_name,
                u.email AS owner_email
           FROM documents d
           JOIN companies c ON c.id = d.company_id
           JOIN users     u ON u.id = d.user_id
           ${mainWhere}
          ORDER BY
            CASE d.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
            d.uploaded_at DESC
          LIMIT $1 OFFSET $2`,
        mainParams,
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM documents d ${cntWhere}`,
        cntParams,
      ),
    ])

    const total = totalResult.rows[0]?.total || 0
    res.json({
      data: rowsResult.rows,
      pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
    })
  } catch (err) {
    console.error('Admin documents error:', err.message)
    res.status(500).json({ error: 'Failed to load documents' })
  }
})

// ── GET /api/admin/export/companies — CSV export of all companies ─────────────
router.get('/export/companies', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        c.id,
        c.company_name,
        c.name        AS contact_name,
        u.email,
        c.country,
        c.sector,
        c.industry,
        c.certification_level,
        c.status,
        ts.score      AS trust_score,
        ts.risk_level AS trust_risk,
        c.created_at
      FROM companies c
      LEFT JOIN users    u  ON u.id  = c.user_id
      LEFT JOIN LATERAL (
        SELECT score, risk_level FROM trust_scores
        WHERE company_id = c.id
        ORDER BY computed_at DESC LIMIT 1
      ) ts ON true
      ORDER BY c.id ASC
    `)

    const HEADERS = [
      'id', 'company_name', 'contact_name', 'email',
      'country', 'sector', 'industry',
      'certification_level', 'status',
      'trust_score', 'trust_risk', 'created_at',
    ]

    const escape = (v) => {
      if (v == null) return ''
      const s = String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }

    const lines = [
      HEADERS.join(','),
      ...result.rows.map(row =>
        HEADERS.map(h => escape(row[h])).join(',')
      ),
    ]

    const filename = `mydd-companies-${new Date().toISOString().slice(0, 10)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send('\uFEFF' + lines.join('\r\n'))   // BOM for Excel UTF-8
  } catch (err) {
    console.error('Admin CSV export error:', err.message)
    res.status(500).json({ error: 'Export failed' })
  }
})

module.exports = router
