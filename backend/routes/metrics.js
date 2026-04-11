'use strict'

const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { computeTrustScore } = require('../lib/trustScore')

/**
 * GET /api/metrics/business
 * Real-time business metrics from the database.
 * Public endpoint (no auth required — aggregated, no PII).
 */
router.get('/business', async (req, res) => {
  try {
    const [
      usersRes,
      companiesRes,
      certifiedRes,
      alertsRes,
      avgScoreRes,
      revenueRes,
      snapshotRes,
    ] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM companies'),
      query('SELECT COUNT(*) FROM companies WHERE certification_level > 0'),
      query('SELECT COUNT(*) FROM fraud_alerts WHERE resolved = FALSE'),
      query(
        "SELECT ROUND(AVG(score), 1) AS avg FROM trust_scores WHERE computed_at > NOW() - INTERVAL '7 days'",
      ),
      query(`
        SELECT COALESCE(SUM(
          CASE certification_level
            WHEN 1 THEN 490
            WHEN 2 THEN 990
            WHEN 3 THEN 2490
            ELSE 0
          END
        ), 0) AS total
        FROM companies
        WHERE certification_level > 0
      `),
      query(
        'SELECT * FROM metrics_snapshot ORDER BY snapshot_at DESC LIMIT 1',
      ),
    ])

    const usersTotal = parseInt(usersRes.rows[0].count, 10)
    const companiesTotal = parseInt(companiesRes.rows[0].count, 10)
    const certifiedTotal = parseInt(certifiedRes.rows[0].count, 10)
    const fraudAlerts = parseInt(alertsRes.rows[0].count, 10)
    const avgTrustScore = parseFloat(avgScoreRes.rows[0].avg || 0)
    const revenueTotal = parseFloat(revenueRes.rows[0].total)
    const prev = snapshotRes.rows[0] || null

    res.json({
      timestamp: new Date().toISOString(),
      users_total: usersTotal,
      companies_total: companiesTotal,
      certified_total: certifiedTotal,
      cert_rate_pct: companiesTotal > 0
        ? Math.round((certifiedTotal / companiesTotal) * 100)
        : 0,
      fraud_alerts_active: fraudAlerts,
      avg_trust_score: isNaN(avgTrustScore) ? 0 : avgTrustScore,
      revenue_total_usd: revenueTotal,
      prev_snapshot: prev
        ? {
            users_count: prev.users_count,
            companies_count: prev.companies_count,
            certified_count: prev.certified_count,
            fraud_alerts_count: prev.fraud_alerts_count,
            avg_trust_score: parseFloat(prev.avg_trust_score),
            revenue_total: parseFloat(prev.revenue_total),
            snapshot_at: prev.snapshot_at,
          }
        : null,
    })
  } catch (err) {
    console.error('Business metrics error:', err.message)
    res.status(500).json({ error: 'Metrics unavailable' })
  }
})

/**
 * POST /api/metrics/snapshot
 * Persist a snapshot (called by cron or internal scheduler).
 * Requires auth header with internal secret.
 */
router.post('/snapshot', async (req, res) => {
  const secret = req.headers['x-metrics-secret']
  if (!process.env.METRICS_SECRET || secret !== process.env.METRICS_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const [users, companies, certified, alerts, avgScore, revenue] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM companies'),
      query('SELECT COUNT(*) FROM companies WHERE certification_level > 0'),
      query('SELECT COUNT(*) FROM fraud_alerts WHERE resolved = FALSE'),
      query(
        "SELECT ROUND(AVG(score), 1) AS avg FROM trust_scores WHERE computed_at > NOW() - INTERVAL '7 days'",
      ),
      query(`
        SELECT COALESCE(SUM(
          CASE certification_level WHEN 1 THEN 490 WHEN 2 THEN 990 WHEN 3 THEN 2490 ELSE 0 END
        ), 0) AS total FROM companies WHERE certification_level > 0
      `),
    ])

    await query(
      `INSERT INTO metrics_snapshot
         (users_count, companies_count, certified_count, fraud_alerts_count, avg_trust_score, revenue_total)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        parseInt(users.rows[0].count, 10),
        parseInt(companies.rows[0].count, 10),
        parseInt(certified.rows[0].count, 10),
        parseInt(alerts.rows[0].count, 10),
        parseFloat(avgScore.rows[0].avg || 0),
        parseFloat(revenue.rows[0].total),
      ],
    )

    res.json({ ok: true, snapshot_at: new Date().toISOString() })
  } catch (err) {
    console.error('Snapshot error:', err.message)
    res.status(500).json({ error: 'Snapshot failed' })
  }
})

/**
 * GET /api/metrics/trust/:userId
 * Compute + return the trust score for a user (auth required at route level).
 */
router.get('/trust/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10)
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' })
    const result = await computeTrustScore(userId)
    if (!result) return res.status(404).json({ error: 'User not found' })
    res.json(result)
  } catch (err) {
    console.error('Trust score error:', err.message)
    res.status(500).json({ error: 'Trust score computation failed' })
  }
})

module.exports = router
