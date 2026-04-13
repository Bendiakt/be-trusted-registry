'use strict'

const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const { getPool, query } = require('../db')
const { computeTrustScore } = require('../lib/trustScore')
const { incMetricsDegradedTotal, incMetricsQueryTimeoutTotal } = require('../lib/runtimeMetrics')
const rateLimit = require('express-rate-limit')

// Rate limiter for the public /business endpoint (aggregated, no PII, but still throttled)
const businessMetricsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
})

// Auth middleware local to this router (avoids circular require with server.js)
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

const METRICS_QUERY_TIMEOUT_MS = parseInt(process.env.METRICS_QUERY_TIMEOUT_MS || '1500', 10)
const BUSINESS_CACHE_TTL_MS = parseInt(process.env.BUSINESS_CACHE_TTL_MS || '30000', 10)
const BUSINESS_CACHE_REFRESH_MS = parseInt(process.env.BUSINESS_CACHE_REFRESH_MS || '60000', 10)

const safeMetricQuery = async (label, text, values = []) => {
  const startedAt = Date.now()
  let timeoutHandle
  const timeoutP = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const err = new Error(`Query timed out after ${METRICS_QUERY_TIMEOUT_MS}ms`)
      err.code = 'METRICS_QUERY_TIMEOUT'
      err.label = label
      reject(err)
    }, METRICS_QUERY_TIMEOUT_MS)
  })

  try {
    return await Promise.race([getPool().query({ text, values }), timeoutP])
  } catch (err) {
    if (err && err.code === 'METRICS_QUERY_TIMEOUT') {
      incMetricsQueryTimeoutTotal()
      console.error(JSON.stringify({
        event: 'metrics_query_timeout',
        endpoint: '/api/metrics/business',
        label,
        timeoutMs: METRICS_QUERY_TIMEOUT_MS,
        elapsedMs: Date.now() - startedAt,
      }))
    }
    throw err
  } finally {
    clearTimeout(timeoutHandle)
  }
}

const settledValue = (result, fallback) => {
  if (!result || result.status !== 'fulfilled') return fallback
  return result.value
}

const emptyBusinessMetrics = () => ({
  timestamp: new Date().toISOString(),
  degraded: false,
  users_total: 0,
  companies_total: 0,
  certified_total: 0,
  cert_rate_pct: 0,
  fraud_alerts_active: 0,
  avg_trust_score: 0,
  revenue_total_usd: 0,
  prev_snapshot: null,
})

const buildPrevSnapshot = (row) => {
  if (!row) return null
  return {
    users_count: row.users_count,
    companies_count: row.companies_count,
    certified_count: row.certified_count,
    fraud_alerts_count: row.fraud_alerts_count,
    avg_trust_score: parseFloat(row.avg_trust_score || 0),
    revenue_total: parseFloat(row.revenue_total || 0),
    snapshot_at: row.snapshot_at,
  }
}

const buildBusinessPayload = ({ businessRow = null, snapshotRow = null, previousSnapshotRow = null, degraded = false }) => {
  const current = businessRow || snapshotRow
  if (!current) return { ...emptyBusinessMetrics(), degraded: true }

  const usersTotal = parseInt(current.users_total ?? current.users_count ?? 0, 10) || 0
  const companiesTotal = parseInt(current.companies_total ?? current.companies_count ?? 0, 10) || 0
  const certifiedTotal = parseInt(current.certified_total ?? current.certified_count ?? 0, 10) || 0
  const fraudAlerts = parseInt(current.fraud_alerts_active ?? current.fraud_alerts_count ?? 0, 10) || 0
  const avgTrustScore = parseFloat(current.avg_trust_score || 0) || 0
  const revenueTotal = parseFloat(current.revenue_total_usd ?? current.revenue_total ?? 0) || 0

  return {
    timestamp: new Date().toISOString(),
    degraded,
    users_total: usersTotal,
    companies_total: companiesTotal,
    certified_total: certifiedTotal,
    cert_rate_pct: companiesTotal > 0 ? Math.round((certifiedTotal / companiesTotal) * 100) : 0,
    fraud_alerts_active: fraudAlerts,
    avg_trust_score: avgTrustScore,
    revenue_total_usd: revenueTotal,
    prev_snapshot: buildPrevSnapshot(businessRow ? snapshotRow : previousSnapshotRow),
  }
}

const persistMetricsSnapshot = async (payload) => {
  await query(
    `INSERT INTO metrics_snapshot
       (users_count, companies_count, certified_count, fraud_alerts_count, avg_trust_score, revenue_total)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      payload.users_total,
      payload.companies_total,
      payload.certified_total,
      payload.fraud_alerts_active,
      payload.avg_trust_score,
      payload.revenue_total_usd,
    ],
  )
}

let businessMetricsCache = emptyBusinessMetrics()
let businessMetricsCacheUpdatedAt = 0
let businessMetricsRefreshPromise = null

const refreshBusinessMetricsCache = async () => {
  if (businessMetricsRefreshPromise) return businessMetricsRefreshPromise

  businessMetricsRefreshPromise = (async () => {
    const [businessRes, snapshotsRes] = await Promise.allSettled([
      safeMetricQuery(
        'business_aggregates',
        `SELECT
           (SELECT COUNT(*) FROM users) AS users_total,
           (SELECT COUNT(*) FROM companies) AS companies_total,
           (SELECT COUNT(*) FROM companies WHERE certification_level > 0) AS certified_total,
           (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = FALSE) AS fraud_alerts_active,
           (SELECT ROUND(AVG(score), 1)
              FROM trust_scores
             WHERE computed_at > NOW() - INTERVAL '7 days') AS avg_trust_score,
           (SELECT COALESCE(SUM(
             CASE certification_level
               WHEN 1 THEN 490
               WHEN 2 THEN 990
               WHEN 3 THEN 2490
               ELSE 0
             END
           ), 0)
              FROM companies
             WHERE certification_level > 0) AS revenue_total_usd`,
      ),
      safeMetricQuery(
        'latest_snapshots',
        `SELECT users_count, companies_count, certified_count, fraud_alerts_count,
                avg_trust_score, revenue_total, snapshot_at
           FROM metrics_snapshot
          ORDER BY id DESC
          LIMIT 2`,
      ),
    ])

    const snapshotRows = settledValue(snapshotsRes, { rows: [] }).rows
    const latestSnapshot = snapshotRows[0] || null
    const previousSnapshot = snapshotRows[1] || null

    if (businessRes.status === 'fulfilled') {
      const payload = buildBusinessPayload({
        businessRow: businessRes.value.rows[0] || null,
        snapshotRow: latestSnapshot,
        previousSnapshotRow: previousSnapshot,
        degraded: false,
      })
      businessMetricsCache = payload
      businessMetricsCacheUpdatedAt = Date.now()
      persistMetricsSnapshot(payload).catch((err) => {
        console.error('Metrics snapshot persist error:', err.message)
      })
      return payload
    }

    if (latestSnapshot) {
      console.error('Business metrics live query failed, serving snapshot fallback:', businessRes.reason?.message || businessRes.reason)
      businessMetricsCache = buildBusinessPayload({
        snapshotRow: latestSnapshot,
        previousSnapshotRow: previousSnapshot,
        degraded: false,
      })
      businessMetricsCacheUpdatedAt = Date.now()
      return businessMetricsCache
    }

    incMetricsDegradedTotal()
    console.error('Business metrics unavailable: no live aggregates and no snapshot fallback')
    businessMetricsCache = { ...emptyBusinessMetrics(), degraded: true }
    businessMetricsCacheUpdatedAt = Date.now()
    return businessMetricsCache
  })().finally(() => {
    businessMetricsRefreshPromise = null
  })

  return businessMetricsRefreshPromise
}

const softWait = (promise, timeoutMs) => new Promise((resolve) => {
  let settled = false
  const timer = setTimeout(() => {
    if (!settled) resolve(null)
  }, timeoutMs)

  promise
    .then((value) => {
      settled = true
      clearTimeout(timer)
      resolve(value)
    })
    .catch(() => {
      settled = true
      clearTimeout(timer)
      resolve(null)
    })
})

refreshBusinessMetricsCache().catch((err) => {
  console.error('Initial metrics cache warmup failed:', err.message)
})

const refreshInterval = setInterval(() => {
  refreshBusinessMetricsCache().catch((err) => {
    console.error('Scheduled metrics cache refresh failed:', err.message)
  })
}, BUSINESS_CACHE_REFRESH_MS)

if (typeof refreshInterval.unref === 'function') refreshInterval.unref()

/**
 * GET /api/metrics/business
 * Real-time business metrics from the database.
 * Public endpoint (no auth required — aggregated, no PII).
 */
router.get('/business', businessMetricsLimiter, async (req, res) => {
  try {
    const cacheAgeMs = Date.now() - businessMetricsCacheUpdatedAt

    if (!businessMetricsCacheUpdatedAt) {
      await softWait(refreshBusinessMetricsCache(), 500)
    } else if (cacheAgeMs > BUSINESS_CACHE_TTL_MS) {
      refreshBusinessMetricsCache().catch((err) => {
        console.error('Async business metrics refresh failed:', err.message)
      })
    }

    res.json(businessMetricsCache)
  } catch (err) {
    console.error('Business metrics error:', err)
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
router.get('/trust/:userId', requireAuth, async (req, res) => {
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
