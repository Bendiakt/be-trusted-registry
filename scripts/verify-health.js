#!/usr/bin/env node
'use strict'
/**
 * scripts/verify-health.js — Vérifie que tous les services sont opérationnels après déploiement.
 * Usage : node scripts/verify-health.js [--env prod|staging]
 */

const ENV = process.argv.includes('--env')
  ? process.argv[process.argv.indexOf('--env') + 1]
  : 'prod'

if (!['prod', 'staging'].includes(ENV)) {
  console.error('Usage: node scripts/verify-health.js [--env prod|staging]')
  process.exit(1)
}

const URLS = {
  prod:    { api: 'https://api.mydd.work',           frontend: 'https://www.mydd.work' },
  staging: { api: 'https://staging-api.mydd.work',   frontend: 'https://staging.mydd.work' },
}

const { api, frontend } = URLS[ENV]

const checks = [
  {
    name: 'Backend /api/health/live',
    url: `${api}/api/health/live`,
    expect: body => body.alive === true || body.status === 'ok',
  },
  {
    name: 'Backend /api/health/ready (DB connection)',
    url: `${api}/api/health/ready`,
    expect: body => body.ready === true && body.db === 'ok',
  },
  {
    name: 'Backend /api/health (process uptime)',
    url: `${api}/api/health`,
    expect: body => body.status === 'ok' && typeof body.uptimeSec === 'number',
  },
  {
    name: 'Public registry accessible',
    url: `${api}/api/registry?limit=1`,
    expect: body => Array.isArray(body) || Array.isArray(body?.data) || Array.isArray(body?.companies),
  },
  {
    name: 'robots.txt accessible',
    url: `${api}/robots.txt`,
    expectText: text => text.includes('Sitemap:') || text.includes('User-agent:'),
  },
  {
    name: 'sitemap.xml accessible',
    url: `${api}/sitemap.xml`,
    expectText: text => text.includes('<?xml') && text.includes('mydd.work'),
  },
  {
    name: 'Auth endpoint active (expect 401)',
    url: `${api}/api/companies/me`,
    expectStatus: 401,
  },
  {
    name: 'Swagger UI accessible',
    url: `${api}/api/docs/`,
    expectText: text => text.includes('swagger') || text.includes('MyDD'),
  },
]

;(async () => {
  console.log(`\nHealth Check — ${ENV.toUpperCase()} environment\n` + '─'.repeat(50))

  let allOk = true
  for (const check of checks) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      const res = await fetch(check.url, { signal: controller.signal })
      clearTimeout(timeout)

      if (check.expectStatus !== undefined) {
        const ok = res.status === check.expectStatus
        console.log(`[${ok ? 'OK  ' : 'FAIL'}] ${check.name} (HTTP ${res.status})`)
        if (!ok) {
          console.log(`       → Expected ${check.expectStatus}, got ${res.status}`)
          allOk = false
        }
        continue
      }

      if (check.expectText) {
        const text = await res.text()
        const ok = res.ok && check.expectText(text)
        console.log(`[${ok ? 'OK  ' : 'FAIL'}] ${check.name} (HTTP ${res.status})`)
        if (!ok) allOk = false
        continue
      }

      const body = await res.json()
      const ok = res.ok && check.expect(body)
      console.log(`[${ok ? 'OK  ' : 'FAIL'}] ${check.name} (HTTP ${res.status})`)
      if (!ok) {
        console.log(`       → Unexpected: ${JSON.stringify(body)}`)
        allOk = false
      }
    } catch (err) {
      console.log(`[FAIL] ${check.name}`)
      console.log(`       → ${err.message}`)
      allOk = false
    }
  }

  console.log('\n' + '─'.repeat(50))
  console.log(allOk ? 'PASS: All services operational\n' : 'FAIL: Some services are down\n')
  process.exit(allOk ? 0 : 1)
})()
