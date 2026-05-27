'use strict'
/**
 * Unit tests for backend/lib/mailer.js
 *
 * Strategy: run all functions in log-only mode (no RESEND_API_KEY set).
 * Verifies:
 *  - Every function resolves without throwing
 *  - Log-only mode emits a JSON line with the expected event name
 *  - Functions handle missing/null email gracefully (early return, no crash)
 *  - Functions handle missing optional fields without throwing
 *
 * No real HTTP calls — Resend is never instantiated (key not present).
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// Ensure no RESEND key so we stay in log-only mode
delete process.env.RESEND_API_KEY

const mailer = require('../lib/mailer')

// ── Helper: capture console.log output during a call ────────────────────────
async function captureLog(fn) {
  const logs = []
  const orig = console.log
  console.log = (...args) => logs.push(args.join(' '))
  try {
    await fn()
  } finally {
    console.log = orig
  }
  return logs
}

// ── sendMissionFeeReceipt ────────────────────────────────────────────────────
describe('sendMissionFeeReceipt', () => {
  test('resolves without throwing in log-only mode', async () => {
    await assert.doesNotReject(() =>
      mailer.sendMissionFeeReceipt({ email: 'co@test.com', name: 'Alice', companyName: 'Acme', feeUsd: 500, missionId: 42 })
    )
  })

  test('logs event name in log-only mode', async () => {
    const logs = await captureLog(() =>
      mailer.sendMissionFeeReceipt({ email: 'co@test.com', name: 'Alice', companyName: 'Acme', feeUsd: 500, missionId: 42 })
    )
    const json = JSON.parse(logs[0])
    assert.equal(json.event, 'mission_fee_receipt.email.queued')
    assert.equal(json.mode, 'log_only')
    assert.equal(json.missionId, 42)
  })

  test('returns early without throwing when email is missing', async () => {
    await assert.doesNotReject(() =>
      mailer.sendMissionFeeReceipt({ email: null, feeUsd: 500, missionId: 42 })
    )
  })
})

// ── sendMissionCommissionEarned ──────────────────────────────────────────────
describe('sendMissionCommissionEarned', () => {
  test('resolves without throwing in log-only mode', async () => {
    await assert.doesNotReject(() =>
      mailer.sendMissionCommissionEarned({ email: 'pac@test.com', name: 'Bob', companyName: 'Acme', commissionUsd: '50.00', missionId: 42 })
    )
  })

  test('logs correct event and commission amount', async () => {
    const logs = await captureLog(() =>
      mailer.sendMissionCommissionEarned({ email: 'pac@test.com', name: 'Bob', companyName: 'Acme', commissionUsd: '50.00', missionId: 42 })
    )
    const json = JSON.parse(logs[0])
    assert.equal(json.event, 'mission_commission.email.queued')
    assert.equal(json.commissionUsd, '50.00')
  })

  test('returns early without throwing when email is missing', async () => {
    await assert.doesNotReject(() =>
      mailer.sendMissionCommissionEarned({ email: undefined, commissionUsd: '50.00', missionId: 42 })
    )
  })
})

// ── sendDisputeSubmitted ─────────────────────────────────────────────────────
describe('sendDisputeSubmitted', () => {
  test('resolves without throwing in log-only mode', async () => {
    await assert.doesNotReject(() =>
      mailer.sendDisputeSubmitted({ adminEmail: 'admin@mydd.work', companyName: 'Acme', reason: 'Incorrect outcome', missionId: 42, disputeId: 7 })
    )
  })

  test('logs event name and dispute metadata', async () => {
    const logs = await captureLog(() =>
      mailer.sendDisputeSubmitted({ adminEmail: 'admin@mydd.work', companyName: 'Acme', reason: 'Wrong result', missionId: 42, disputeId: 7 })
    )
    const json = JSON.parse(logs[0])
    assert.equal(json.event, 'dispute_submitted.email.queued')
    assert.equal(json.disputeId, 7)
    assert.equal(json.missionId, 42)
  })

  test('returns early without throwing when adminEmail is missing', async () => {
    await assert.doesNotReject(() =>
      mailer.sendDisputeSubmitted({ adminEmail: null, reason: 'x'.repeat(20), missionId: 42, disputeId: 7 })
    )
  })
})

// ── sendDisputeResolved ──────────────────────────────────────────────────────
describe('sendDisputeResolved', () => {
  test('resolves without throwing — upheld', async () => {
    await assert.doesNotReject(() =>
      mailer.sendDisputeResolved({ email: 'co@test.com', name: 'Alice', companyName: 'Acme', missionId: 42, disputeId: 7, resolution: 'upheld', notes: 'Outcome corrected.' })
    )
  })

  test('resolves without throwing — dismissed', async () => {
    await assert.doesNotReject(() =>
      mailer.sendDisputeResolved({ email: 'co@test.com', name: 'Alice', companyName: 'Acme', missionId: 42, disputeId: 7, resolution: 'dismissed', notes: null })
    )
  })

  test('logs event and resolution type', async () => {
    const logs = await captureLog(() =>
      mailer.sendDisputeResolved({ email: 'co@test.com', name: 'Alice', companyName: 'Acme', missionId: 42, disputeId: 7, resolution: 'upheld', notes: null })
    )
    const json = JSON.parse(logs[0])
    assert.equal(json.event, 'dispute_resolved.email.queued')
    assert.equal(json.resolution, 'upheld')
    assert.equal(json.disputeId, 7)
  })

  test('handles missing notes (null) without throwing', async () => {
    await assert.doesNotReject(() =>
      mailer.sendDisputeResolved({ email: 'co@test.com', companyName: 'X', missionId: 1, disputeId: 1, resolution: 'dismissed', notes: null })
    )
  })

  test('returns early without throwing when email is missing', async () => {
    await assert.doesNotReject(() =>
      mailer.sendDisputeResolved({ email: null, missionId: 42, disputeId: 7, resolution: 'dismissed' })
    )
  })
})

// ── Pre-existing functions — smoke check ────────────────────────────────────
describe('existing email functions — log-only smoke check', () => {
  const cases = [
    ['sendPaymentConfirmation',   () => mailer.sendPaymentConfirmation({ email: 'x@x.com', amountCents: 10000, level: 2, companyName: 'Acme' })],
    ['sendWelcome',               () => mailer.sendWelcome({ email: 'x@x.com', name: 'Alice' })],
    ['sendPasswordReset',         () => mailer.sendPasswordReset({ email: 'x@x.com', name: 'Alice', resetUrl: 'https://mydd.work/reset?t=tok' })],
    ['sendMissionAssigned',       () => mailer.sendMissionAssigned({ email: 'pac@x.com', name: 'Bob', companyName: 'Acme', location: 'Paris', fee: 500, missionId: 1 })],
    ['sendMissionCompleted',      () => mailer.sendMissionCompleted({ email: 'co@x.com', name: 'Alice', companyName: 'Acme', outcome: 'pass', missionId: 1 })],
    ['sendEmailVerification',     () => mailer.sendEmailVerification({ email: 'x@x.com', name: 'Alice', verifyUrl: 'https://mydd.work/verify?t=tok' })],
    ['sendRenewalReminder',       () => mailer.sendRenewalReminder({ email: 'x@x.com', name: 'Alice', companyName: 'Acme', level: 2, expiresAt: new Date(), renewUrl: 'https://mydd.work' })],
  ]

  for (const [name, fn] of cases) {
    test(`${name} — resolves without throwing in log-only mode`, async () => {
      await assert.doesNotReject(fn)
    })
  }
})
