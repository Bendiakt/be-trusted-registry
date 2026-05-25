#!/usr/bin/env node
'use strict'
/**
 * scripts/load-test.js — Test de charge MyDD (pure Node.js, zéro dépendance).
 *
 * Scénarios :
 *   1. GET /api/health/ready          — liveness baseline
 *   2. GET /api/registry              — endpoint le plus utilisé
 *   3. POST /api/auth/login (invalid) — auth path (expect 401)
 *
 * Usage :
 *   node scripts/load-test.js [--url https://api.mydd.work] [--duration 30] [--concurrency 50]
 *
 * Options :
 *   --url          Base URL du backend  (défaut: https://api.mydd.work)
 *   --duration     Durée en secondes    (défaut: 30)
 *   --concurrency  Workers parallèles   (défaut: 20)
 *   --rps-target   Alerte si RPS < N    (défaut: 50)
 *   --p95-target   Alerte si p95 > N ms (défaut: 800)
 */

const https = require('https')
const http  = require('http')

const args        = process.argv.slice(2)
const get         = (flag, def) => args.includes(flag) ? args[args.indexOf(flag) + 1] : def

const BASE_URL    = get('--url',         'https://api.mydd.work')
const DURATION_S  = Number(get('--duration',    '30'))
const CONCURRENCY = Number(get('--concurrency', '20'))
const RPS_TARGET  = Number(get('--rps-target',  '50'))
const P95_TARGET  = Number(get('--p95-target',  '800'))

const parsed = new URL(BASE_URL)
const mod    = parsed.protocol === 'https:' ? https : http

// ── Helpers ───────────────────────────────────────────────────────────────────

const request = (method, path, body) => new Promise((resolve) => {
  const payload = body ? JSON.stringify(body) : null
  const options = {
    hostname: parsed.hostname,
    port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path,
    method,
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': payload ? Buffer.byteLength(payload) : 0,
    },
    timeout: 10_000,
  }

  const start = Date.now()
  const req = mod.request(options, (res) => {
    res.resume() // drain body
    res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - start, ok: true }))
  })
  req.on('error', ()  => resolve({ status: 0, ms: Date.now() - start, ok: false }))
  req.on('timeout', () => { req.destroy(); resolve({ status: 0, ms: Date.now() - start, ok: false }) })
  if (payload) req.write(payload)
  req.end()
})

const percentile = (sorted, p) => sorted[Math.floor(sorted.length * p / 100)] ?? 0

// ── Scenarios ─────────────────────────────────────────────────────────────────

const SCENARIOS = [
  { name: 'GET /health/ready',  weight: 2, run: () => request('GET',  '/api/health/ready') },
  { name: 'GET /registry',      weight: 5, run: () => request('GET',  '/api/registry?page=1&limit=20') },
  { name: 'POST /auth/login',   weight: 3, run: () => request('POST', '/api/auth/login', { email: 'load@test.io', password: 'wrong' }) },
]

// Build a weighted sequence
const SEQUENCE = SCENARIOS.flatMap(s => Array(s.weight).fill(s))
let seqIdx = 0
const nextScenario = () => SEQUENCE[seqIdx++ % SEQUENCE.length]

// ── Collector ─────────────────────────────────────────────────────────────────

const results = {} // scenario name → { latencies[], errors, total }
for (const s of SCENARIOS) results[s.name] = { latencies: [], errors: 0, total: 0 }

// ── Worker loop ───────────────────────────────────────────────────────────────

const deadline = Date.now() + DURATION_S * 1000
let inflight = 0
let globalTotal = 0

const worker = async () => {
  while (Date.now() < deadline) {
    const s   = nextScenario()
    const res = await s.run()
    const rec = results[s.name]
    rec.total++
    globalTotal++
    if (!res.ok || res.status >= 500) {
      rec.errors++
    } else {
      rec.latencies.push(res.ms)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

;(async () => {
  const bar = '─'.repeat(60)
  console.log(`\nMyDD Load Test — ${BASE_URL}`)
  console.log(bar)
  console.log(`Concurrency : ${CONCURRENCY} workers`)
  console.log(`Duration    : ${DURATION_S}s`)
  console.log(`Scenarios   : ${SCENARIOS.map(s => s.name).join(' | ')}`)
  console.log(`Targets     : RPS ≥ ${RPS_TARGET}  |  p95 ≤ ${P95_TARGET} ms`)
  console.log(bar)
  console.log('Running...\n')

  // Progress ticker
  const ticker = setInterval(() => {
    const elapsed = ((Date.now() - (deadline - DURATION_S * 1000)) / 1000).toFixed(0)
    process.stdout.write(`\r  ${elapsed}s elapsed — ${globalTotal} requests sent`)
  }, 500)

  const start = Date.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  clearInterval(ticker)

  const elapsed = (Date.now() - start) / 1000
  console.log('\n')

  // ── Report ──────────────────────────────────────────────────────────────────

  let allOk = true

  for (const [name, rec] of Object.entries(results)) {
    if (rec.total === 0) continue
    const sorted  = [...rec.latencies].sort((a, b) => a - b)
    const p50     = percentile(sorted, 50)
    const p95     = percentile(sorted, 95)
    const p99     = percentile(sorted, 99)
    const errPct  = ((rec.errors / rec.total) * 100).toFixed(1)
    const rps     = (rec.total / elapsed).toFixed(1)

    console.log(`  ${name}`)
    console.log(`    Total: ${rec.total}  |  RPS: ${rps}  |  Errors: ${rec.errors} (${errPct}%)`)
    console.log(`    p50: ${p50}ms  |  p95: ${p95}ms  |  p99: ${p99}ms`)
    console.log()
  }

  // Global stats
  const allLatencies = Object.values(results).flatMap(r => r.latencies).sort((a, b) => a - b)
  const totalErrors  = Object.values(results).reduce((s, r) => s + r.errors, 0)
  const globalRps    = (globalTotal / elapsed).toFixed(1)
  const globalP95    = percentile(allLatencies, 95)
  const globalP50    = percentile(allLatencies, 50)
  const errPct       = ((totalErrors / globalTotal) * 100).toFixed(1)

  console.log(bar)
  console.log('GLOBAL SUMMARY')
  console.log(bar)
  console.log(`  Total requests : ${globalTotal}`)
  console.log(`  Duration       : ${elapsed.toFixed(1)}s`)
  console.log(`  RPS            : ${globalRps}  (target ≥ ${RPS_TARGET})`)
  console.log(`  p50 latency    : ${globalP50}ms`)
  console.log(`  p95 latency    : ${globalP95}ms  (target ≤ ${P95_TARGET}ms)`)
  console.log(`  Errors         : ${totalErrors} (${errPct}%)`)
  console.log(bar)

  const rpsOk = Number(globalRps)  >= RPS_TARGET
  const p95Ok = Number(globalP95)  <= P95_TARGET
  const errOk = Number(errPct)     < 5

  if (rpsOk && p95Ok && errOk) {
    console.log('\n✅ PASS — All performance targets met\n')
    process.exit(0)
  } else {
    if (!rpsOk) console.log(`❌ RPS ${globalRps} < target ${RPS_TARGET}`)
    if (!p95Ok) console.log(`❌ p95 ${globalP95}ms > target ${P95_TARGET}ms`)
    if (!errOk) console.log(`❌ Error rate ${errPct}% ≥ 5%`)
    console.log('\n⚠️  WARN — Some targets not met (see above)\n')
    process.exit(1)
  }
})()
