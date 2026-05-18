#!/usr/bin/env node
'use strict'
/**
 * Load test runner — uses autocannon (install: npm i -g autocannon)
 *
 * Usage:
 *   MYDD_API_KEY=mydd_lk_... node tests/load/run.js
 *   MYDD_BASE_URL=https://api-staging.mydd.work MYDD_API_KEY=... node tests/load/run.js
 */

const autocannon = require('autocannon')

const BASE     = process.env.MYDD_BASE_URL || 'http://localhost:5000'
const API_KEY  = process.env.MYDD_API_KEY  || ''
const DURATION = parseInt(process.env.LOAD_DURATION_S || '30', 10)  // seconds
const CONNS    = parseInt(process.env.LOAD_CONNECTIONS || '10', 10)  // concurrent connections

if (!API_KEY) {
  console.error('ERROR: set MYDD_API_KEY to a valid API key before running load tests.')
  process.exit(1)
}

// ── Acceptance thresholds ─────────────────────────────────────────────────────
const THRESHOLDS = {
  registry: { p99Ms: 500, errorPct: 0.1 },
  verify:   { p99Ms: 300, errorPct: 0.1 },
  health:   { p99Ms: 50,  errorPct: 0.0 },
}

// ── Scenario runner ────────────────────────────────────────────────────────────
const run = (label, opts) => new Promise((resolve) => {
  console.log(`\n▶  ${label} — ${DURATION}s × ${CONNS} connections`)
  const instance = autocannon({ duration: DURATION, connections: CONNS, ...opts })
  autocannon.track(instance, { renderLatencyTable: false, renderResultsTable: false })
  instance.on('done', resolve)
})

const pct = (n, digits = 1) => n.toFixed(digits)

const check = (label, result, { p99Ms, errorPct }) => {
  const p99    = result.latency.p99
  const errors = result['2xx'] + result.non2xx > 0
    ? (result.non2xx / (result['2xx'] + result.non2xx)) * 100
    : 0
  const p99Ok  = p99 <= p99Ms
  const errOk  = errors <= errorPct

  const status = p99Ok && errOk ? '✓ PASS' : '✗ FAIL'
  console.log(
    `\n${status}  ${label}`
  )
  console.log(
    `  p99 latency: ${p99} ms  (threshold: ${p99Ms} ms)  ${p99Ok ? '✓' : '✗'}`
  )
  console.log(
    `  Error rate:  ${pct(errors)}%  (threshold: ${pct(errorPct)}%)  ${errOk ? '✓' : '✗'}`
  )
  console.log(
    `  Throughput:  ${pct(result.requests.average)} req/s  |  Total: ${result.requests.total} requests`
  )
  return p99Ok && errOk
}

// ── Main ───────────────────────────────────────────────────────────────────────
;(async () => {
  console.log(`\nMyDD load test — ${BASE}`)
  console.log(`Duration: ${DURATION}s  |  Connections: ${CONNS}`)

  const authHeader = [{ name: 'X-API-Key', value: API_KEY }]

  const [registryResult, verifyResult, healthResult] = await Promise.all([
    run('GET /api/registry (authenticated)', {
      url: `${BASE}/api/registry?limit=50`,
      headers: authHeader,
    }),
    run('GET /api/verify/1 (public)', {
      url: `${BASE}/api/verify/1`,
      headers: authHeader,
    }),
    run('GET /api/health (liveness)', {
      url: `${BASE}/api/health`,
    }),
  ])

  console.log('\n══════════════════════════════════════════════════════')
  console.log('RESULTS')
  console.log('══════════════════════════════════════════════════════')

  const pass = [
    check('GET /api/registry', registryResult, THRESHOLDS.registry),
    check('GET /api/verify/1', verifyResult,   THRESHOLDS.verify),
    check('GET /api/health',   healthResult,   THRESHOLDS.health),
  ]

  console.log('\n══════════════════════════════════════════════════════')
  if (pass.every(Boolean)) {
    console.log('✓ ALL SCENARIOS PASSED')
    process.exit(0)
  } else {
    const failed = pass.filter(p => !p).length
    console.log(`✗ ${failed}/${pass.length} SCENARIO(S) FAILED`)
    process.exit(1)
  }
})()
