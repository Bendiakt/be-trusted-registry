#!/usr/bin/env node
const fs = require('fs')

const BASE_URL = (process.env.BACKEND_URL || 'https://be-trusted-registry-production.up.railway.app').replace(/\/$/, '')
const FILE = process.env.PERSIST_FILE || '/tmp/be-persist-check.json'
const mode = process.argv[2]

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let json = {}
  try {
    json = await res.json()
  } catch {
    json = {}
  }
  return { status: res.status, json }
}

async function init() {
  const email = `persist-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.io`
  const password = 'Persist123!'

  const reg = await post('/api/auth/register', {
    name: 'Persist Check',
    email,
    password,
    role: 'company',
  })

  const login = await post('/api/auth/login', { email, password })
  const tokenBefore = Boolean(login.json.token)

  const payload = {
    email,
    password,
    registerStatus: reg.status,
    registerResponse: reg.json,
    loginBeforeStatus: login.status,
    tokenBefore,
    ts: new Date().toISOString(),
  }

  fs.writeFileSync(FILE, JSON.stringify(payload, null, 2))

  console.log(`persist_file=${FILE}`)
  console.log(`email=${email}`)
  console.log(`register_status=${reg.status}`)
  console.log(`token_before_ok=${tokenBefore ? 'yes' : 'no'}`)

  if (!tokenBefore) {
    process.exit(2)
  }
}

async function verify() {
  if (!fs.existsSync(FILE)) {
    console.error(`Missing persistence file: ${FILE}`)
    process.exit(2)
  }

  const payload = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const login = await post('/api/auth/login', {
    email: payload.email,
    password: payload.password,
  })

  const tokenAfter = Boolean(login.json.token)
  console.log(`email=${payload.email}`)
  console.log(`login_after_status=${login.status}`)
  console.log(`token_after_ok=${tokenAfter ? 'yes' : 'no'}`)

  if (!tokenAfter) {
    process.exit(3)
  }
}

async function main() {
  if (mode === 'init') return init()
  if (mode === 'verify') return verify()
  console.error('Usage: node scripts/persistence-proof.js <init|verify>')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
