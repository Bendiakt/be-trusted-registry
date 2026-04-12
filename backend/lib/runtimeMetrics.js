'use strict'

let metricsDegradedTotal = 0
let metricsQueryTimeoutTotal = 0

const incMetricsDegradedTotal = () => {
  metricsDegradedTotal += 1
}

const incMetricsQueryTimeoutTotal = () => {
  metricsQueryTimeoutTotal += 1
}

const getRuntimeMetrics = () => ({
  metricsDegradedTotal,
  metricsQueryTimeoutTotal,
})

module.exports = {
  incMetricsDegradedTotal,
  incMetricsQueryTimeoutTotal,
  getRuntimeMetrics,
}
