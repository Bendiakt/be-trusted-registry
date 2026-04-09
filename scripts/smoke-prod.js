#!/usr/bin/env node

const baseUrl = (process.env.BACKEND_URL || '').replace(/\/$/, '')

if (!baseUrl) {
  console.error('Usage: BACKEND_URL=https://your-backend node scripts/smoke-prod.js')
  process.exit(1)
}

const email = `prodsmoke${Date.now()}@example.com`
const password = 'Secret123'

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()

  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  return { status: response.status, body }
}

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const main = async () => {
  const health = await request('/api/health')
  assert(health.status === 200, `Health failed: ${health.status}`)

  const register = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Prod Smoke', email, password, role: 'company' }),
  })
  assert(register.status === 200, `Register failed: ${register.status} ${JSON.stringify(register.body)}`)

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert(login.status === 200 && login.body?.token, `Login failed: ${login.status} ${JSON.stringify(login.body)}`)

  const token = login.body.token
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const meBefore = await request('/api/companies/me', { headers: { Authorization: `Bearer ${token}` } })
  assert(meBefore.status === 200, `Companies/me failed: ${meBefore.status}`)

  const company = await request('/api/companies/register', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Prod Metals',
      industry: 'Trading',
      country: 'UAE',
      description: 'Production smoke test',
    }),
  })
  assert(company.status === 200 && company.body?.company?.id, `Company register failed: ${company.status} ${JSON.stringify(company.body)}`)

  const companyId = company.body.company.id
  const verify = await request(`/api/verify/${companyId}`)
  assert(verify.status === 200, `Verify failed: ${verify.status} ${JSON.stringify(verify.body)}`)
  assert(verify.body?.companyName === 'Prod Metals', 'Verify companyName mismatch')
  assert(verify.body?.sector === 'Trading', 'Verify sector mismatch')

  const checkout = await request('/api/payments/create-checkout-session', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ planId: 'level1' }),
  })
  assert(checkout.status === 200 && typeof checkout.body?.url === 'string', `Checkout failed: ${checkout.status} ${JSON.stringify(checkout.body)}`)

  console.log(JSON.stringify({
    ok: true,
    health: health.body,
    register: register.body,
    loginUser: login.body.user,
    meBefore: meBefore.body,
    company: company.body.company,
    verify: verify.body,
    checkout: { status: checkout.status, hasUrl: true },
  }, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})