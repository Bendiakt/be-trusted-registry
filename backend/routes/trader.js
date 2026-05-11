'use strict'
/**
 * Trader Portal API
 *
 * All routes require authentication. The auth middleware (`req.user`) is applied
 * at mount time in server.js (`app.use('/api/trader', auth, traderRouter)`).
 * Access is implicitly limited to trader + admin roles by convention; the
 * RoleRoute guard on the frontend enforces the role, and the rate limiter here
 * adds a server-side throttle.
 *
 * Endpoints:
 *   GET    /api/trader/stats              — dashboard summary
 *   GET    /api/trader/watchlist          — paginated watchlist with live cert status
 *   POST   /api/trader/watchlist/:id      — add company to watchlist
 *   DELETE /api/trader/watchlist/:id      — remove from watchlist
 *   GET    /api/trader/watchlist/export   — CSV download of full watchlist
 */

const express         = require('express')
const rateLimit       = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')
const { query }       = require('../db')

const router = express.Router()

// ── Rate limiters ─────────────────────────────────────────────────────────────
const readLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `trader:read:${req.user?.id || ipKeyGenerator(req)}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many requests. Slow down.' },
})

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `trader:write:${req.user?.id || ipKeyGenerator(req)}`,
  validate: { keyGeneratorIpFallback: false },
  message: { error: 'Too many write requests. Slow down.' },
})

// ── GET /api/trader/stats ─────────────────────────────────────────────────────
// Dashboard KPIs: watchlist size, cert coverage, expiring-soon count.
router.get('/stats', readLimiter, async (req, res) => {
  try {
    const userId = req.user.id
    const stats = await query(
      `SELECT
         COUNT(*)                                                                AS watched_total,
         COUNT(*) FILTER (WHERE c.certification_level > 0)                     AS watched_certified,
         COUNT(*) FILTER (WHERE cert.expires_at < NOW() + INTERVAL '30 days'
                            AND cert.expires_at > NOW()
                            AND cert.status = 'active')                        AS expiring_soon,
         COUNT(*) FILTER (WHERE cert.status = 'expired'
                           OR c.certification_level = 0)                       AS uncertified
       FROM trader_watchlist tw
       JOIN companies     c    ON c.id   = tw.company_id
       LEFT JOIN certifications cert
              ON cert.company_id = c.id
             AND cert.status IN ('active', 'expired')
             AND cert.id = (
                   SELECT id FROM certifications
                    WHERE company_id = c.id
                    ORDER BY created_at DESC LIMIT 1
                 )
      WHERE tw.user_id = $1`,
      [userId]
    )
    res.json(stats.rows[0] || { watched_total: 0, watched_certified: 0, expiring_soon: 0, uncertified: 0 })
  } catch (err) {
    console.error('trader/stats error:', err.message)
    res.status(500).json({ error: 'Failed to load stats' })
  }
})

// ── GET /api/trader/watchlist ─────────────────────────────────────────────────
// Returns the trader's watched companies with live certification status.
// Query params: page (default 1), limit (default 20, max 100), q (name search)
router.get('/watchlist', readLimiter, async (req, res) => {
  try {
    const userId = req.user.id
    const page   = Math.max(1, parseInt(req.query.page  || '1', 10))
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)))
    const offset = (page - 1) * limit
    const q      = req.query.q ? `%${req.query.q.trim()}%` : null
    const params = [userId, limit, offset]
    const filter = q ? (params.push(q), `AND (c.name ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`) : ''

    const [rows, count] = await Promise.all([
      query(
        `SELECT
           c.id, c.name, c.company_name, c.industry, c.sector, c.country,
           c.website, c.certification_level AS level, c.status AS company_status,
           tw.added_at,
           cert.status    AS cert_status,
           cert.expires_at,
           cert.granted_at,
           ts.score       AS trust_score
         FROM trader_watchlist tw
         JOIN companies c ON c.id = tw.company_id
         LEFT JOIN LATERAL (
           SELECT status, expires_at, granted_at
             FROM certifications
            WHERE company_id = c.id
            ORDER BY created_at DESC LIMIT 1
         ) cert ON true
         LEFT JOIN LATERAL (
           SELECT score
             FROM trust_scores
            WHERE company_id = c.id
            ORDER BY computed_at DESC LIMIT 1
         ) ts ON true
        WHERE tw.user_id = $1
        ${filter}
        ORDER BY tw.added_at DESC
        LIMIT $2 OFFSET $3`,
        params
      ),
      query(
        `SELECT COUNT(*)::int AS total
           FROM trader_watchlist tw
           JOIN companies c ON c.id = tw.company_id
          WHERE tw.user_id = $1 ${filter}`,
        q ? [userId, `%${req.query.q.trim()}%`] : [userId]
      ),
    ])

    const total = count.rows[0]?.total || 0
    res.json({
      data: rows.rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('trader/watchlist error:', err.message)
    res.status(500).json({ error: 'Failed to load watchlist' })
  }
})

// ── GET /api/trader/watchlist/export ─────────────────────────────────────────
// CSV download — full watchlist, no pagination.
router.get('/watchlist/export', readLimiter, async (req, res) => {
  try {
    const userId = req.user.id
    const rows = await query(
      `SELECT
         c.name, c.company_name, c.country, c.sector, c.website,
         c.certification_level AS level,
         cert.status    AS cert_status,
         cert.granted_at,
         cert.expires_at,
         ts.score       AS trust_score,
         tw.added_at
       FROM trader_watchlist tw
       JOIN companies c ON c.id = tw.company_id
       LEFT JOIN LATERAL (
         SELECT status, granted_at, expires_at
           FROM certifications
          WHERE company_id = c.id
          ORDER BY created_at DESC LIMIT 1
       ) cert ON true
       LEFT JOIN LATERAL (
         SELECT score FROM trust_scores
          WHERE company_id = c.id
          ORDER BY computed_at DESC LIMIT 1
       ) ts ON true
      WHERE tw.user_id = $1
      ORDER BY c.name ASC`,
      [userId]
    )

    const header = ['Name', 'Legal Name', 'Country', 'Sector', 'Website', 'Cert Level', 'Cert Status', 'Granted At', 'Expires At', 'Trust Score', 'Watched Since']
    const escape = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`)
    const lines = [
      header.join(','),
      ...rows.rows.map(r => [
        r.name, r.company_name, r.country, r.sector, r.website,
        r.level, r.cert_status,
        r.granted_at ? new Date(r.granted_at).toISOString().slice(0, 10) : '',
        r.expires_at ? new Date(r.expires_at).toISOString().slice(0, 10) : '',
        r.trust_score,
        r.added_at ? new Date(r.added_at).toISOString().slice(0, 10) : '',
      ].map(escape).join(',')),
    ]

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="watchlist-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send(lines.join('\r\n'))
  } catch (err) {
    console.error('trader/watchlist/export error:', err.message)
    res.status(500).json({ error: 'Export failed' })
  }
})

// ── POST /api/trader/watchlist/:id ───────────────────────────────────────────
// Add a company to the trader's watchlist. Silently idempotent (ON CONFLICT).
router.post('/watchlist/:id', writeLimiter, async (req, res) => {
  try {
    const userId    = req.user.id
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    // Verify company exists
    const exists = await query('SELECT id FROM companies WHERE id = $1 LIMIT 1', [companyId])
    if (!exists.rows.length) return res.status(404).json({ error: 'Company not found' })

    await query(
      `INSERT INTO trader_watchlist (user_id, company_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      [userId, companyId]
    )
    res.status(201).json({ watched: true, companyId })
  } catch (err) {
    console.error('trader/watchlist POST error:', err.message)
    res.status(500).json({ error: 'Failed to add to watchlist' })
  }
})

// ── DELETE /api/trader/watchlist/:id ─────────────────────────────────────────
// Remove a company from the trader's watchlist.
router.delete('/watchlist/:id', writeLimiter, async (req, res) => {
  try {
    const userId    = req.user.id
    const companyId = parseInt(req.params.id, 10)
    if (Number.isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })

    await query(
      'DELETE FROM trader_watchlist WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    )
    res.json({ watched: false, companyId })
  } catch (err) {
    console.error('trader/watchlist DELETE error:', err.message)
    res.status(500).json({ error: 'Failed to remove from watchlist' })
  }
})

module.exports = router
