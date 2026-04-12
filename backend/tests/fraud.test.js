'use strict'

const { test, describe, mock } = require('node:test')
const assert = require('node:assert/strict')

// Stub the db module so fraudDetection can be loaded without a DB connection.
const fakeQuery = mock.fn(async () => ({ rows: [{ count: '0' }] }))
require.cache[require.resolve('../db')] = {
  id: require.resolve('../db'),
  filename: require.resolve('../db'),
  loaded: true,
  exports: { query: fakeQuery },
}

const { checkFraud } = require('../lib/fraudDetection')

describe('checkFraud — rule 1: disposable email domain', () => {
  test('flags mailinator.com as disposable_email', async () => {
    const alerts = await checkFraud({ email: 'x@mailinator.com', action: 'user_register', ip: null })
    assert.ok(alerts.some(a => a.rule === 'disposable_email'), 'expected disposable_email alert')
  })

  test('flags yopmail.com as disposable_email', async () => {
    const alerts = await checkFraud({ email: 'x@yopmail.com', action: 'user_register', ip: null })
    assert.ok(alerts.some(a => a.rule === 'disposable_email'))
  })

  test('does not flag a legitimate domain', async () => {
    const alerts = await checkFraud({ email: 'user@gmail.com', action: 'user_register', ip: null })
    assert.ok(!alerts.some(a => a.rule === 'disposable_email'))
  })

  test('does not throw when email is undefined', async () => {
    await assert.doesNotReject(() => checkFraud({ action: 'user_register', ip: null }))
  })
})

describe('checkFraud — rule 2: no company profile at checkout', () => {
  test('flags checkout_session with companyId = null', async () => {
    const alerts = await checkFraud({ action: 'checkout_session', companyId: null, email: 'a@b.com', ip: null })
    assert.ok(alerts.some(a => a.rule === 'no_company_profile'))
  })

  test('does not flag checkout_session when companyId is set', async () => {
    const alerts = await checkFraud({ action: 'checkout_session', companyId: 42, email: 'a@b.com', ip: null })
    assert.ok(!alerts.some(a => a.rule === 'no_company_profile'))
  })

  test('does not flag non-checkout action with null companyId', async () => {
    const alerts = await checkFraud({ action: 'user_register', companyId: null, email: 'a@b.com', ip: null })
    assert.ok(!alerts.some(a => a.rule === 'no_company_profile'))
  })
})
