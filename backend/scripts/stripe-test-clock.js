'use strict'

/**
 * stripe-test-clock.js — Stripe Test Clock utility for local subscription testing.
 *
 * Simulates subscription lifecycle events (renewal, expiry, invoice) without
 * waiting real calendar time. Requires STRIPE_SECRET_KEY to be a test-mode key.
 *
 * Usage (run from backend/):
 *   node scripts/stripe-test-clock.js create               — create a new test clock
 *   node scripts/stripe-test-clock.js advance <clock_id>   — advance clock +31 days
 *   node scripts/stripe-test-clock.js list                  — list all test clocks
 *   node scripts/stripe-test-clock.js delete <clock_id>    — delete a test clock
 *   node scripts/stripe-test-clock.js full-cycle            — create clock + customer +
 *                                                             subscription, then advance
 *
 * After running full-cycle, your local webhook endpoint (e.g. via Stripe CLI
 * `stripe listen --forward-to localhost:4000/api/payments/webhook`) will receive:
 *   - customer.subscription.updated
 *   - invoice.payment_succeeded
 *   - invoice.finalized
 *
 * Prerequisites:
 *   1. STRIPE_SECRET_KEY must be set (test key, starts with sk_test_)
 *   2. For full-cycle, optionally set TEST_CUSTOMER_EMAIL (default: testclock@mydd.local)
 *   3. Stripe CLI running: stripe listen --forward-to localhost:4000/api/payments/webhook
 */

require('dotenv').config()
const Stripe = require('stripe')

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY is not set.')
  console.error('       Export it or add it to backend/.env')
  process.exit(1)
}

if (!STRIPE_KEY.startsWith('sk_test_')) {
  console.error('ERROR: STRIPE_SECRET_KEY is not a test-mode key.')
  console.error('       Test clocks only work with keys starting with sk_test_')
  process.exit(1)
}

const stripe = Stripe(STRIPE_KEY)

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoFromNow(daysOffset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return d.toISOString()
}

function unixFromNow(daysOffset = 0) {
  return Math.floor(Date.now() / 1000) + daysOffset * 86400
}

function formatDate(unixTs) {
  return new Date(unixTs * 1000).toISOString().split('T')[0]
}

// ── Commands ───────────────────────────────────────────────────────────────────

async function cmdCreate() {
  console.log('Creating test clock…')
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `mydd-dev-${Date.now()}`,
  })
  console.log(`✓ Created test clock: ${clock.id}`)
  console.log(`  Frozen at: ${formatDate(clock.frozen_time)}`)
  console.log(`  Status:    ${clock.status}`)
  console.log()
  console.log('To advance this clock by 31 days:')
  console.log(`  node scripts/stripe-test-clock.js advance ${clock.id}`)
  return clock
}

async function cmdAdvance(clockId) {
  if (!clockId) {
    console.error('Usage: node scripts/stripe-test-clock.js advance <clock_id>')
    process.exit(1)
  }

  const existing = await stripe.testHelpers.testClocks.retrieve(clockId)
  const newFrozenTime = existing.frozen_time + 31 * 86400

  console.log(`Advancing clock ${clockId}…`)
  console.log(`  From: ${formatDate(existing.frozen_time)}`)
  console.log(`  To:   ${formatDate(newFrozenTime)} (+31 days)`)

  const clock = await stripe.testHelpers.testClocks.advance(clockId, {
    frozen_time: newFrozenTime,
  })

  console.log(`✓ Clock advanced. Status: ${clock.status}`)
  console.log('  Stripe is now generating subscription events — check your webhook listener.')
  return clock
}

async function cmdList() {
  console.log('Listing test clocks…')
  const clocks = await stripe.testHelpers.testClocks.list({ limit: 20 })
  if (clocks.data.length === 0) {
    console.log('  (no test clocks found)')
    return
  }
  for (const c of clocks.data) {
    console.log(`  ${c.id}  frozen=${formatDate(c.frozen_time)}  status=${c.status}  name=${c.name || '—'}`)
  }
  console.log(`\nTotal: ${clocks.data.length} clock(s)`)
}

async function cmdDelete(clockId) {
  if (!clockId) {
    console.error('Usage: node scripts/stripe-test-clock.js delete <clock_id>')
    process.exit(1)
  }
  await stripe.testHelpers.testClocks.del(clockId)
  console.log(`✓ Deleted test clock: ${clockId}`)
}

async function cmdFullCycle() {
  const testEmail = process.env.TEST_CUSTOMER_EMAIL || 'testclock@mydd.local'
  console.log('=== Full cycle: clock → customer → subscription → advance ===')
  console.log()

  // 1. Create test clock
  console.log('Step 1: Create test clock')
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `mydd-fullcycle-${Date.now()}`,
  })
  console.log(`  ✓ Clock created: ${clock.id} (frozen at ${formatDate(clock.frozen_time)})`)
  console.log()

  // 2. Create a test customer attached to the clock
  console.log('Step 2: Create test customer')
  const customer = await stripe.customers.create({
    email: testEmail,
    name:  'MyDD Test Corp (test clock)',
    test_clock: clock.id,
    metadata: { source: 'stripe-test-clock-script', env: 'dev' },
  })
  console.log(`  ✓ Customer created: ${customer.id} (${customer.email})`)
  console.log()

  // 3. Create a test subscription for Level 1 (smallest plan)
  // We use a price_data one-time item so no real Price ID is needed.
  console.log('Step 3: Create subscription via payment method + subscription API')
  console.log('  (attach a test payment method first)')
  const pm = await stripe.paymentMethods.create({
    type: 'card',
    card: { token: 'tok_visa' },
  })
  await stripe.paymentMethods.attach(pm.id, { customer: customer.id })
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  })
  console.log(`  ✓ Test Visa card attached: ${pm.id}`)

  // Create a subscription with a short trial (0 days) so first invoice fires on advance
  const sub = await stripe.subscriptions.create({
    customer:         customer.id,
    items:            [{ price_data: {
      currency:    'usd',
      product_data: { name: 'MyDD Certification Level 1 (test)' },
      recurring:   { interval: 'month' },
      unit_amount: 29900,   // $299 / month
    } }],
    trial_end: Math.floor(Date.now() / 1000) + 60, // 60s trial so it lapses on advance
    expand:   ['latest_invoice.payment_intent'],
  })
  console.log(`  ✓ Subscription created: ${sub.id}  status=${sub.status}`)
  console.log()

  // 4. Advance the clock by 31 days — this fires renewal events
  console.log('Step 4: Advance clock +31 days to trigger renewal')
  const advanced = await stripe.testHelpers.testClocks.advance(clock.id, {
    frozen_time: clock.frozen_time + 31 * 86400,
  })
  console.log(`  ✓ Clock advancing to ${formatDate(clock.frozen_time + 31 * 86400)}`)
  console.log(`  Status: ${advanced.status}  (may be "advancing" — events fire asynchronously)`)
  console.log()

  // 5. Summary
  console.log('=== Summary ===')
  console.log(`  Clock ID:       ${clock.id}`)
  console.log(`  Customer ID:    ${customer.id}`)
  console.log(`  Subscription:   ${sub.id}`)
  console.log()
  console.log('Next steps:')
  console.log('  1. Ensure Stripe CLI is forwarding webhooks:')
  console.log('       stripe listen --forward-to localhost:4000/api/payments/webhook')
  console.log('  2. Watch for events: invoice.payment_succeeded, customer.subscription.updated')
  console.log('  3. Check your DB: SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;')
  console.log(`  4. Clean up: node scripts/stripe-test-clock.js delete ${clock.id}`)
  console.log()
  console.log('To advance the clock further:')
  console.log(`  node scripts/stripe-test-clock.js advance ${clock.id}`)
}

// ── Entry point ────────────────────────────────────────────────────────────────

const [,, command, arg] = process.argv

const COMMANDS = {
  create:     () => cmdCreate(),
  advance:    () => cmdAdvance(arg),
  list:       () => cmdList(),
  delete:     () => cmdDelete(arg),
  'full-cycle': () => cmdFullCycle(),
}

if (!command || !COMMANDS[command]) {
  console.log('Usage: node scripts/stripe-test-clock.js <command> [args]')
  console.log()
  console.log('Commands:')
  console.log('  create                    Create a new test clock')
  console.log('  advance <clock_id>        Advance clock by 31 days')
  console.log('  list                      List all test clocks')
  console.log('  delete <clock_id>         Delete a test clock')
  console.log('  full-cycle                Full cycle: clock + customer + subscription + advance')
  console.log()
  console.log('Environment:')
  console.log('  STRIPE_SECRET_KEY         Required — must be a sk_test_* key')
  console.log('  TEST_CUSTOMER_EMAIL       Optional — defaults to testclock@mydd.local')
  process.exit(command ? 1 : 0)
}

COMMANDS[command]().catch(err => {
  console.error('Error:', err.message)
  if (err.type === 'StripeAuthenticationError') {
    console.error('  → Check that STRIPE_SECRET_KEY is valid')
  }
  if (err.type === 'StripeInvalidRequestError') {
    console.error('  → Stripe API error:', err.raw?.message || err.message)
  }
  process.exit(1)
})
