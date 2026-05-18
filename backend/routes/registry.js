'use strict'
/**
 * routes/registry.js — Public Supplier Registry
 *
 * GET /api/registry  — paginated, searchable list of certified companies.
 * Mounted in server.js at /api/registry (no auth required).
 *
 * B2B access: supply X-API-Key: mydd_... header with scope "registry:read"
 * to authenticate, meter usage, and receive a higher rate limit (300 req/min).
 */

const express = require('express')
const { publicReadLimiter, apiKeyReadLimiter } = require('../lib/auth')
const { apiKeyAuth } = require('../lib/apiKeyAuth')
const { query }      = require('../db')

const router = express.Router()

// Optional B2B API key auth — validates key + scope, records usage.
// Falls through transparently if no X-API-Key header is present.
const optionalApiKey = apiKeyAuth('registry:read')

// Rate limiter: API key holders get 300 req/min; anonymous gets 30 req/min.
const smartLimiter = (req, res, next) =>
  req.apiKey ? apiKeyReadLimiter(req, res, next) : publicReadLimiter(req, res, next)

// GET /api/registry
router.get('/', optionalApiKey, smartLimiter, async (req, res) => {
  try {
    const page   = Math.max(parseInt(req.query.page  || '1',  10) || 1, 1)
    const limit  = Math.min(Math.max(parseInt(req.query.limit || '20', 10) || 20, 1), 100)
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
    console.error(JSON.stringify({ event: 'registry.error', err: err.message }))
    res.status(500).json({ error: 'Failed to load registry' })
  }
})

module.exports = router
