'use strict'
/**
 * routes/verify.js — Public company verification endpoint
 *
 * GET /api/verify/:id  — returns full company profile + live cert info.
 * Mounted in server.js at /api/verify (no auth required).
 *
 * B2B access: supply X-API-Key: mydd_... header with scope "verify:read"
 * to authenticate, meter usage, and receive a higher rate limit (300 req/min).
 */

const express = require('express')
const { publicReadLimiter, apiKeyReadLimiter } = require('../lib/auth')
const { apiKeyAuth } = require('../lib/apiKeyAuth')
const { query }      = require('../db')
const { mapCompanyRow } = require('../lib/mappers')

const router = express.Router()

const optionalApiKey = apiKeyAuth('verify:read')
const smartLimiter   = (req, res, next) =>
  req.apiKey ? apiKeyReadLimiter(req, res, next) : publicReadLimiter(req, res, next)

// GET /api/verify/:id
router.get('/:id', optionalApiKey, smartLimiter, async (req, res) => {
  try {
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    const result  = await query('SELECT * FROM companies WHERE id = $1 LIMIT 1', [companyId])
    const company = mapCompanyRow(result.rows[0])
    if (!company) return res.status(404).json({ error: 'Company not found' })

    // Attach certInfo (expiry, days left) — mirrors logic in /api/companies/me
    let certInfo = null
    const certResult = await query(
      `SELECT level, status, granted_at, expires_at
         FROM certifications
        WHERE company_id = $1 AND status IN ('active', 'submitted')
        ORDER BY level DESC, id DESC LIMIT 1`,
      [companyId]
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
    console.error(JSON.stringify({ event: 'verify.error', companyId: req.params.id, err: err.message }))
    res.status(500).json({ error: 'Verification failed' })
  }
})

module.exports = router
