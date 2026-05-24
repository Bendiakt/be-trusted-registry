'use strict'
/**
 * routes/prometheus.js — Process-level Prometheus & JSON metrics endpoints.
 *
 * GET /metrics      — text/plain Prometheus scrape format
 * GET /metrics/json — JSON for modern dashboards
 *
 * Both routes are protected by the `metricsAuth` middleware (METRICS_TOKEN).
 * Mounted at root level in server.js.
 */

const express            = require('express')
const { getRuntimeMetrics } = require('../lib/runtimeMetrics')

const router = express.Router()

// ── Auth guard ────────────────────────────────────────────────────────────────
// Protected by METRICS_TOKEN env var (Bearer or ?token= query param).
// Blocks in production if token not configured; open in dev for convenience.
const metricsAuth = (req, res, next) => {
  const expectedToken = process.env.METRICS_TOKEN
  if (!expectedToken) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Metrics endpoint not configured' })
    }
    return next()
  }
  const provided =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    req.query.token
  if (!provided || provided !== expectedToken) {
    return res.status(401).set('WWW-Authenticate', 'Bearer realm="metrics"').json({ error: 'Unauthorized' })
  }
  return next()
}

// ── GET /metrics — Prometheus scrape ─────────────────────────────────────────
router.get('/metrics', metricsAuth, (req, res) => {
  const m            = getRuntimeMetrics()
  const uptimeSec    = (Date.now() - m.startTime) / 1000
  const mem          = process.memoryUsage()
  const avgLatencyMs = m.requestCount > 0 ? m.totalLatency / m.requestCount : 0
  const errorRatePct = m.requestCount > 0 ? (m.errorCount / m.requestCount) * 100 : 0

  const lines = [
    '# HELP process_uptime_seconds Total uptime of the process in seconds',
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${uptimeSec.toFixed(3)}`,
    '',
    '# HELP http_requests_total Total number of HTTP requests received',
    '# TYPE http_requests_total counter',
    `http_requests_total ${m.requestCount}`,
    '',
    '# HELP http_errors_total Total number of HTTP responses with status >= 400',
    '# TYPE http_errors_total counter',
    `http_errors_total ${m.errorCount}`,
    '',
    '# HELP http_request_latency_avg_ms Average request latency in milliseconds',
    '# TYPE http_request_latency_avg_ms gauge',
    `http_request_latency_avg_ms ${avgLatencyMs.toFixed(3)}`,
    '',
    '# HELP http_error_rate_percent Percentage of requests that resulted in an error',
    '# TYPE http_error_rate_percent gauge',
    `http_error_rate_percent ${errorRatePct.toFixed(4)}`,
    '',
    '# HELP metrics_degraded_total Total number of degraded /api/metrics/business responses',
    '# TYPE metrics_degraded_total counter',
    `metrics_degraded_total ${m.metricsDegradedTotal}`,
    '',
    '# HELP metrics_query_timeout_total Total number of query timeouts while computing metrics',
    '# TYPE metrics_query_timeout_total counter',
    `metrics_query_timeout_total ${m.metricsQueryTimeoutTotal}`,
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

// ── GET /metrics/json — JSON dashboard ───────────────────────────────────────
router.get('/metrics/json', metricsAuth, (req, res) => {
  const m            = getRuntimeMetrics()
  const mem          = process.memoryUsage()
  const avgLatencyMs = m.requestCount > 0 ? m.totalLatency / m.requestCount : 0
  const errorRatePct = m.requestCount > 0 ? (m.errorCount / m.requestCount) * 100 : 0

  res.json({
    timestamp:                    new Date().toISOString(),
    uptime_ms:                    Date.now() - m.startTime,
    requests_total:               m.requestCount,
    errors_total:                 m.errorCount,
    metrics_degraded_total:       m.metricsDegradedTotal,
    metrics_query_timeout_total:  m.metricsQueryTimeoutTotal,
    latency_avg_ms:               parseFloat(avgLatencyMs.toFixed(3)),
    error_rate_percent:           parseFloat(errorRatePct.toFixed(4)),
    memory: {
      rss_mb:       parseFloat((mem.rss       / 1024 / 1024).toFixed(2)),
      heap_used_mb: parseFloat((mem.heapUsed  / 1024 / 1024).toFixed(2)),
      heap_total_mb:parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
    },
    node_version: process.version,
    environment:  process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'unknown',
  })
})

module.exports = router
