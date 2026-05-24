'use strict'

const startTime = Date.now()

let requestCount          = 0
let totalLatency          = 0
let errorCount            = 0
let metricsDegradedTotal  = 0
let metricsQueryTimeoutTotal = 0

/**
 * Called by the server.js request-finish middleware for every response.
 * @param {number} durationMs - elapsed time in milliseconds
 * @param {number} statusCode - HTTP status code
 */
const incRequest = (durationMs, statusCode) => {
  requestCount += 1
  totalLatency += durationMs
  if (statusCode >= 400) errorCount += 1
}

const incMetricsDegradedTotal = () => {
  metricsDegradedTotal += 1
}

const incMetricsQueryTimeoutTotal = () => {
  metricsQueryTimeoutTotal += 1
}

const getRuntimeMetrics = () => ({
  startTime,
  requestCount,
  totalLatency,
  errorCount,
  metricsDegradedTotal,
  metricsQueryTimeoutTotal,
})

module.exports = {
  incRequest,
  incMetricsDegradedTotal,
  incMetricsQueryTimeoutTotal,
  getRuntimeMetrics,
}
