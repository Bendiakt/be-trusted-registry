'use strict'

const express   = require('express')
const rateLimit = require('express-rate-limit')
const router    = express.Router()

const { query }                  = require('../db')
const { auth, requireAdmin }     = require('../lib/authUtils')
const { logAudit }               = require('../lib/audit')
const { AUDIT }                  = require('../lib/auditActions')
const { notifyUser }             = require('../lib/wsNotify')
const { createNotification }     = require('../lib/notify')
const { sendCertGranted,
        sendCertRevoked,
        sendPacKycDecision,
        sendFounderWelcome,
        sendS2Promoted,
        sendS3Promoted }         = require('../lib/mailer')
const { dispatchWebhook }        = require('../lib/webhookDispatch')
const { isBlockedCompany }       = require('../lib/blocklist')
const { validate, schemas }      = require('../lib/validators')

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
    console.error(JSON.stringify({ event: 'admin_stats_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_user_detail_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to load user' })
  }
})

// ── PATCH /api/admin/users/:id/role ─────────────────────────────────────────
router.patch('/users/:id/role', auth, requireAdmin, adminWriteLimiter, validate(schemas.assignRole), async (req, res) => {
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
    console.error(JSON.stringify({ event: 'admin_change_role_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_delete_user_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_users_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_company_detail_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_companies_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Failed to load companies' })
  }
})

// ── PATCH /api/admin/companies/:id/level ─────────────────────────────────────
router.patch('/companies/:id/level', auth, requireAdmin, adminWriteLimiter, validate(schemas.certifyCompany), async (req, res) => {
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
        // Upsert certification record, send email, fire webhooks
        query(
          `INSERT INTO certifications (company_id, level, status, granted_at, expires_at)
           VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 year')
           ON CONFLICT (company_id, level) DO UPDATE
             SET status = 'active', granted_at = NOW(), expires_at = NOW() + INTERVAL '1 year',
                 updated_at = NOW()
           RETURNING id, granted_at`,
          [companyId, level],
        ).then(async ({ rows: certRows }) => {
          const certId   = certRows[0]?.id
          const grantedAt = certRows[0]?.granted_at
          const userRows = await query('SELECT email, name FROM users WHERE id = $1 LIMIT 1', [company.user_id])
          if (!userRows.rows.length) return
          const frontendUrl = process.env.FRONTEND_URL || 'https://mydd.work'
          sendCertGranted({
            email: userRows.rows[0].email,
            name:  userRows.rows[0].name,
            companyName: company.company_name,
            level,
            verifyUrl: `${frontendUrl}/verify/${companyId}`,
            grantedAt,
            certId,
          }).catch(() => {})
          // Webhook fan-out (fire-and-forget)
          dispatchWebhook('cert.issued', { companyId, level, status: 'active', certId })
          dispatchWebhook('cert.status_changed', { companyId, level, oldStatus: 'pending', newStatus: 'active', certId })
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
        // Webhook fan-out for revocation (fire-and-forget)
        dispatchWebhook('cert.revoked', { companyId, level: company.certification_level, status: 'revoked' })
        dispatchWebhook('cert.status_changed', { companyId, level: company.certification_level, oldStatus: 'active', newStatus: 'revoked' })
      }
    }
    res.json({ company })
  } catch (err) {
    console.error(JSON.stringify({ event: 'admin_set_level_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Update failed' })
  }
})

// ── PATCH /api/admin/companies/:id/suspend ────────────────────────────────────
router.patch('/companies/:id/suspend', auth, requireAdmin, adminWriteLimiter, validate(schemas.suspendCompany), async (req, res) => {
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
    console.error(JSON.stringify({ event: 'suspend_company_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Update failed' })
  }
})

// ── PATCH /api/admin/missions/:id/status ─────────────────────────────────────
router.patch('/missions/:id/status', auth, requireAdmin, adminWriteLimiter, validate(schemas.updateCompanyStatus), async (req, res) => {
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
    console.error(JSON.stringify({ event: 'admin_mission_status_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_missions_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_audit_log_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_fraud_alerts_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_resolve_alert_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_documents_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
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
    console.error(JSON.stringify({ event: 'admin_csv_export_error', reqId: req.reqId, message: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined }))
    res.status(500).json({ error: 'Export failed' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PAC v3 — Mission scoring + payment confirmation
// ─────────────────────────────────────────────────────────────────────────────

// PATCH /api/admin/missions/:id/score
// Admin scores a completed mission (1–5) and optionally confirms client payment.
// Setting payment_confirmed=true stamps payment_confirmed_at and calculates commission.
router.patch('/missions/:id/score', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const missionId = parseInt(req.params.id, 10)
    const { admin_score, payment_confirmed, stripe_invoice_id } = req.body

    if (Number.isNaN(missionId)) return res.status(400).json({ error: 'Invalid mission id' })
    if (admin_score !== undefined && (admin_score < 1 || admin_score > 5)) {
      return res.status(400).json({ error: 'admin_score must be 1–5' })
    }

    // Fetch current mission + PAC profile for commission calculation
    const mRes = await query(`
      SELECT m.*, pp.pac_tier, pp.commission_rate, pp.id AS pac_id
      FROM missions m
      LEFT JOIN users u   ON u.id  = m.assigned_to
      LEFT JOIN pac_profiles pp ON pp.user_id = m.assigned_to
      WHERE m.id = $1
    `, [missionId])

    if (!mRes.rows.length) return res.status(404).json({ error: 'Mission not found' })
    const mission = mRes.rows[0]

    // Calculate commission if we're confirming payment
    let commissionCents = mission.commission_amount_cents
    if (payment_confirmed && !mission.payment_confirmed_at) {
      const rate = parseFloat(mission.commission_rate || 0.10)
      commissionCents = Math.round((mission.fee_usd || 0) * 100 * rate)
    }

    const result = await query(`
      UPDATE missions SET
        admin_score            = COALESCE($1, admin_score),
        admin_scored_at        = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE admin_scored_at END,
        payment_confirmed_at   = CASE WHEN $2 THEN COALESCE(payment_confirmed_at, NOW()) ELSE payment_confirmed_at END,
        stripe_invoice_id      = COALESCE($3, stripe_invoice_id),
        commission_amount_cents = COALESCE($4, commission_amount_cents),
        updated_at             = NOW()
      WHERE id = $5
      RETURNING *
    `, [
      admin_score || null,
      payment_confirmed || false,
      stripe_invoice_id || null,
      commissionCents,
      missionId
    ])

    logAudit(req.user.id, 'admin_mission_scored', 'missions', req.ip, {
      missionId, admin_score, payment_confirmed, commissionCents
    })

    res.json({ mission: result.rows[0] })
  } catch (err) {
    console.error(JSON.stringify({ event: 'admin_mission_score_error', message: err.message }))
    res.status(500).json({ error: 'Update failed' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PAC v3 — KYC / tier management
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/pac/agents — list all PAC agents with tier + KYC status
router.get('/pac/agents', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const { tier, kyc_status, page = 1, limit = 50 } = req.query
    const offset = (Math.max(parseInt(page,10),1) - 1) * Math.min(parseInt(limit,10),200)

    const { rows } = await query(`
      SELECT
        pp.*,
        u.email, u.name AS user_name, u.created_at AS user_created_at,
        -- Active supervisees count
        (SELECT COUNT(*) FROM pac_supervision ps WHERE ps.supervisor_id = pp.id AND ps.status = 'active') AS active_supervisees,
        -- Completed missions
        (SELECT COUNT(*) FROM missions m WHERE m.assigned_to = pp.user_id AND m.status = 'completed') AS missions_completed,
        -- Pending bonus (draft statements)
        (SELECT COALESCE(SUM(final_bonus_cents),0) FROM pac_bonus_payouts pb WHERE pb.supervisor_id = pp.id AND pb.status = 'draft') AS pending_bonus_cents
      FROM pac_profiles pp
      JOIN users u ON u.id = pp.user_id
      WHERE ($1::text IS NULL OR pp.pac_tier = $1)
        AND ($2::text IS NULL OR pp.kyc_status = $2)
      ORDER BY pp.pac_tier DESC, pp.created_at DESC
      LIMIT $3 OFFSET $4
    `, [tier || null, kyc_status || null, Math.min(parseInt(limit,10),200), offset])

    res.json({ agents: rows })
  } catch (err) {
    console.error(JSON.stringify({ event: 'admin_pac_agents_error', message: err.message }))
    res.status(500).json({ error: 'Failed to load PAC agents' })
  }
})

// PATCH /api/admin/pac/agents/:id/kyc — approve or reject KYC + optionally set tier
router.patch('/pac/agents/:id/kyc', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const pacId = parseInt(req.params.id, 10)
    const { kyc_status, pac_tier, notes } = req.body

    const VALID_KYC  = ['approved','rejected','suspended']
    const VALID_TIER = ['S1','S2','S3']

    if (!VALID_KYC.includes(kyc_status)) return res.status(400).json({ error: 'Invalid kyc_status' })
    if (pac_tier && !VALID_TIER.includes(pac_tier)) return res.status(400).json({ error: 'Invalid pac_tier' })

    // Set commission_rate and max_supervised based on tier
    const tierConfig = { S1: { commission_rate: 0.10, max_supervised: 0 }, S2: { commission_rate: 0.15, max_supervised: 10 }, S3: { commission_rate: 0.20, max_supervised: 5 } }
    const cfg = pac_tier ? tierConfig[pac_tier] : null

    const { rows } = await query(`
      UPDATE pac_profiles SET
        kyc_status      = $1,
        pac_tier        = COALESCE($2, pac_tier),
        commission_rate = COALESCE($3, commission_rate),
        max_supervised  = COALESCE($4, max_supervised),
        updated_at      = NOW()
      WHERE id = $5
      RETURNING *
    `, [kyc_status, pac_tier || null, cfg?.commission_rate || null, cfg?.max_supervised || null, pacId])

    if (!rows.length) return res.status(404).json({ error: 'PAC agent not found' })

    logAudit(req.user.id, 'admin_pac_kyc_update', 'pac_profiles', req.ip, { pacId, kyc_status, pac_tier, notes })

    // Send in-app notification to the PAC agent
    const pac = rows[0]
    const notifTitle = kyc_status === 'approved'
      ? `KYC approved — you are now ${pac.pac_tier}`
      : `KYC status update: ${kyc_status}`
    const notifBody  = kyc_status === 'approved'
      ? `Your MyDD PAC profile has been verified. You can now accept missions as a ${pac.pac_tier} agent.`
      : `Your KYC application has been ${kyc_status}. ${notes || ''}`

    await query(`
      INSERT INTO notifications (user_id, type, title, body)
      VALUES ($1, $2, $3, $4)
    `, [pac.user_id, kyc_status === 'approved' ? 'success' : 'warning', notifTitle, notifBody]).catch(() => {})

    // Email the agent with the KYC decision
    const agentEmailResult = await query(
      'SELECT email FROM users WHERE id = $1 LIMIT 1',
      [pac.user_id]
    ).catch(() => ({ rows: [] }))
    sendPacKycDecision({
      email:      agentEmailResult.rows[0]?.email,
      agentName:  pac.full_name,
      kyc_status,
      pac_tier:   pac.pac_tier,
      notes,
    }).catch(() => {})

    res.json({ agent: rows[0] })
  } catch (err) {
    console.error(JSON.stringify({ event: 'admin_pac_kyc_error', message: err.message }))
    res.status(500).json({ error: 'Update failed' })
  }
})

// PATCH /api/admin/pac/:id/approve-upgrade — approve an S1→S2 or S2→S3 promotion
// Requires: agent must have eligible_for_s2 or eligible_for_s3 = TRUE (set by nightly cron).
// Creates a Stripe subscription with 365-day free trial.
// Body: { tier: 'S2'|'S3' }
router.patch('/pac/:id/approve-upgrade', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  const { tier } = req.body
  const userId   = parseInt(req.params.id, 10)
  const VALID_UPGRADE_TIERS = ['S2', 'S3']

  if (!userId) return res.status(400).json({ error: 'Invalid user id' })
  if (!VALID_UPGRADE_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'tier must be S2 or S3' })
  }

  const client = await require('../db').getPool().connect()
  try {
    await client.query('BEGIN')

    // Fetch agent profile
    const { rows: pacRows } = await client.query(
      `SELECT pp.*, u.email, u.name, u.stripe_customer_id
       FROM pac_profiles pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.user_id = $1 LIMIT 1`,
      [userId]
    )
    if (!pacRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'PAC profile not found' })
    }
    const pac = pacRows[0]

    // Verify eligibility flag
    const eligibleField = tier === 'S2' ? 'eligible_for_s2' : 'eligible_for_s3'
    if (!pac[eligibleField]) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Agent is not flagged eligible_for_${tier.toLowerCase()}` })
    }

    // Tier config
    const tierConfig = {
      S2: { commission_rate: 0.15, max_supervised: 10, priceEnvKey: 'STRIPE_PAC_S2_PRICE_ID', amountUsd: 399 },
      S3: { commission_rate: 0.20, max_supervised: 5,  priceEnvKey: 'STRIPE_PAC_S3_PRICE_ID', amountUsd: 799 },
    }
    const cfg = tierConfig[tier]

    // Create Stripe subscription with 365-day free trial
    let stripeSubId = null
    const priceId = process.env[cfg.priceEnvKey]
    if (priceId) {
      try {
        const Stripe = require('stripe')
        const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

        // Ensure Stripe customer exists
        let customerId = pac.stripe_customer_id
        if (!customerId && pac.email) {
          const customer = await stripe.customers.create({
            email: pac.email,
            metadata: { userId: String(userId) },
          })
          customerId = customer.id
          await client.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId])
        }

        const promotionDate = new Date()
        const trialEnd = Math.floor((promotionDate.getTime() + 365 * 24 * 60 * 60 * 1000) / 1000)
        const sub = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          trial_end: trialEnd,
          metadata: {
            pac_user_id:      String(userId),
            pac_tier:         tier.toLowerCase(),
            promotion_date:   promotionDate.toISOString(),
            subscriptionType: 'pac_membership',
          },
        })
        stripeSubId = sub.id
      } catch (stripeErr) {
        console.error(JSON.stringify({ event: 'admin.pac.approve_upgrade.stripe_error', err: stripeErr.message }))
        // Non-fatal: proceed without Stripe — admin can fix later
      }
    }

    const now = new Date()
    const anniversary = new Date(now)
    anniversary.setFullYear(anniversary.getFullYear() + 1)

    // Promote the agent
    await client.query(
      `UPDATE pac_profiles SET
         pac_tier                  = $1,
         kyc_status                = 'approved',
         commission_rate           = $2,
         max_supervised            = $3,
         membership_active         = TRUE,
         membership_expires        = $4,
         membership_stripe_sub_id  = COALESCE($5, membership_stripe_sub_id),
         promotion_date_s2         = CASE WHEN $1 IN ('S2','s2') THEN NOW() ELSE promotion_date_s2 END,
         promotion_date_s3         = CASE WHEN $1 IN ('S3','s3') THEN NOW() ELSE promotion_date_s3 END,
         tier_anniversary          = $6,
         eligible_for_s2           = CASE WHEN $1 IN ('S2','s2') THEN FALSE ELSE eligible_for_s2 END,
         eligible_for_s3           = CASE WHEN $1 IN ('S3','s3') THEN FALSE ELSE eligible_for_s3 END,
         updated_at                = NOW()
       WHERE user_id = $7`,
      [tier, cfg.commission_rate, cfg.max_supervised, anniversary.toISOString(),
       stripeSubId, anniversary.toDateString(), userId]
    )

    await client.query(
      `UPDATE users SET pac_tier = $1, pac_status = 'approved' WHERE id = $2`,
      [tier.toLowerCase(), userId]
    )

    await client.query('COMMIT')

    await logAudit(req.user.id, AUDIT.PAC_UPGRADE_APPROVED, 'pac_profiles', req.ip, {
      targetUserId: userId, tier, stripeSubId,
    })

    // Fire promotion email (non-blocking)
    const emailFn = tier === 'S2' ? sendS2Promoted : sendS3Promoted
    emailFn({
      email:            pac.email,
      full_name:        pac.full_name,
      anniversary_date: anniversary,
    }).catch(() => {})

    res.json({
      message:          `Agent promoted to ${tier}`,
      tier,
      anniversary_date: anniversary,
      stripe_sub_id:    stripeSubId,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(JSON.stringify({ event: 'admin_pac_approve_upgrade_error', message: err.message }))
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

// PATCH /api/admin/pac/:id/founder — grant S3 Founder status (B&E mgmt only)
// Body: { region: 'west_africa'|'central_east_africa'|'mena'|'europe'|'asia' }
// - Caps active founders at 5
// - Sets pac_tier='s3', membership_active=true, membership_expires=+1yr, kyc_status='pending'
// - Bypasses Stripe entirely — no charge for Y1
router.patch('/pac/:id/founder', auth, requireAdmin, adminWriteLimiter, async (req, res) => {
  const VALID_REGIONS = ['west_africa', 'central_east_africa', 'mena', 'europe', 'asia']
  const { region } = req.body
  const userId = parseInt(req.params.id, 10)

  if (!userId) return res.status(400).json({ error: 'Invalid user id' })
  if (!region || !VALID_REGIONS.includes(region)) {
    return res.status(400).json({ error: `region must be one of: ${VALID_REGIONS.join(', ')}` })
  }

  const client = await require('../db').getPool().connect()
  try {
    await client.query('BEGIN')

    // Enforce max 5 active founders
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) FROM pac_profiles
       WHERE is_founder = TRUE AND founder_exemption_expires > NOW()`
    )
    if (parseInt(countRows[0].count, 10) >= 5) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Maximum 5 active founders already reached' })
    }

    // Verify target user exists and has a PAC profile
    const { rows: pacRows } = await client.query(
      `SELECT pp.id, pp.full_name, u.email
       FROM pac_profiles pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.user_id = $1`,
      [userId]
    )
    if (!pacRows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'PAC profile not found for this user' })
    }
    const pac = pacRows[0]

    // S3 Fondateurs get 24 months free (Y0 + Y1 per PAC Network v4.0 spec)
    const exemptionExpires = new Date()
    exemptionExpires.setFullYear(exemptionExpires.getFullYear() + 2)

    // Upgrade pac_profiles
    await client.query(
      `UPDATE pac_profiles SET
         is_founder               = TRUE,
         founder_exemption_expires = $1,
         founder_region           = $2,
         pac_tier                 = 's3',
         membership_active        = TRUE,
         membership_expires       = $1,
         kyc_status               = 'pending',
         updated_at               = NOW()
       WHERE user_id = $3`,
      [exemptionExpires, region, userId]
    )

    // Sync users table tier
    await client.query(
      `UPDATE users SET pac_tier = 's3', pac_status = 'pending' WHERE id = $1`,
      [userId]
    )

    await client.query('COMMIT')

    await logAudit(req.user.id, AUDIT.PAC_FOUNDER_GRANTED, 'pac_profiles', req.ip, {
      targetUserId: userId,
      region,
      exemptionExpires,
    })

    // Fire welcome email (non-blocking)
    sendFounderWelcome({
      email:             pac.email,
      full_name:         pac.full_name,
      region,
      exemption_expires: exemptionExpires,
    }).catch(() => {})

    res.json({
      message:          'Founder status granted',
      tier:             's3',
      region,
      exemption_expires: exemptionExpires,
      kyc_status:       'pending',
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(JSON.stringify({ event: 'admin_pac_founder_error', message: err.message }))
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

// GET /api/admin/pac/supervision/pending — all pending supervision requests
router.get('/pac/supervision/pending', auth, requireAdmin, adminReadLimiter, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        ps.*,
        sup_pp.pac_tier AS supervisor_tier, sup_pp.full_name AS supervisor_name, sup_u.email AS supervisor_email,
        sub_pp.pac_tier AS supervised_tier, sub_pp.full_name AS supervised_name, sub_u.email AS supervised_email
      FROM pac_supervision ps
      JOIN pac_profiles sup_pp ON sup_pp.id = ps.supervisor_id
      JOIN users sup_u          ON sup_u.id  = sup_pp.user_id
      JOIN pac_profiles sub_pp ON sub_pp.id = ps.supervised_id
      JOIN users sub_u          ON sub_u.id  = sub_pp.user_id
      WHERE ps.status = 'pending'
      ORDER BY ps.requested_at ASC
    `)
    res.json({ requests: rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to load pending requests' })
  }
})

module.exports = router
