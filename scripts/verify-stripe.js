#!/usr/bin/env node
'use strict'
/**
 * scripts/verify-stripe.js — Vérifie la configuration Stripe avant go-live.
 * Usage : STRIPE_SECRET_KEY=sk_live_xxx node scripts/verify-stripe.js
 */

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY manquant\n  Usage: STRIPE_SECRET_KEY=sk_live_xxx node scripts/verify-stripe.js')
  process.exit(1)
}

// Use Stripe from backend dependencies
let Stripe
try {
  Stripe = require('../backend/node_modules/stripe')
} catch {
  console.error('Stripe SDK not found. Run: cd backend && npm install')
  process.exit(1)
}

const stripe = new Stripe(key, { apiVersion: '2024-04-10' })
const isLive = key.startsWith('sk_live_')

;(async () => {
  console.log(`\nStripe Verification — ${isLive ? 'LIVE' : 'TEST'} mode\n` + '─'.repeat(50))

  if (isLive) {
    console.log('[WARN] Using LIVE key — all operations are real\n')
  }

  const checks = []

  // Check 1 — Account accessible
  try {
    const account = await stripe.accounts.retrieve()
    checks.push({ name: 'Account accessible', ok: true, value: account.email || account.id })
  } catch (err) {
    checks.push({ name: 'Account accessible', ok: false, value: err.message })
  }

  // Check 2 — Products & prices
  try {
    const products = await stripe.products.list({ active: true, limit: 100 })
    const names    = products.data.map(p => p.name.toLowerCase())

    const hasL1     = names.some(n => n.includes('l1') || n.includes('bronze') || n.includes('level 1') || n.includes('document verification'))
    const hasL2     = names.some(n => n.includes('l2') || n.includes('silver') || n.includes('level 2') || n.includes('kyc'))
    const hasL3     = names.some(n => n.includes('l3') || n.includes('gold')   || n.includes('level 3') || n.includes('site inspection'))
    const hasTrader = names.some(n => n.includes('trader'))

    checks.push({ name: 'Product L1 (Bronze · $499/yr) exists', ok: hasL1, value: hasL1 ? 'found' : 'Create Level 1 product in Stripe Dashboard' })
    checks.push({ name: 'Product L2 (Silver · $999/yr) exists', ok: hasL2, value: hasL2 ? 'found' : 'Create Level 2 product in Stripe Dashboard' })
    checks.push({ name: 'Product L3 (Gold · $2499/yr) exists',  ok: hasL3, value: hasL3 ? 'found' : 'Create Level 3 product in Stripe Dashboard' })
    checks.push({ name: 'Product Trader Portal exists',          ok: hasTrader, value: hasTrader ? 'found' : 'Create Trader Portal product ($49/mo · $499/yr)' })

    // Check prices
    const prices = await stripe.prices.list({ active: true, limit: 100 })

    const annualPrices   = prices.data.filter(p => p.recurring?.interval === 'year')
    const monthlyPrices  = prices.data.filter(p => p.recurring?.interval === 'month')

    // Annual prices: check $499, $999, $2499
    const has499  = annualPrices.some(p => p.unit_amount === 49900)
    const has999  = annualPrices.some(p => p.unit_amount === 99900)
    const has2499 = annualPrices.some(p => p.unit_amount === 249900)
    const has49mo = monthlyPrices.some(p => p.unit_amount === 4900)
    const has499y = annualPrices.some(p => p.unit_amount === 49900)

    checks.push({ name: 'Price $499/yr (L1) configured',   ok: has499,  value: has499  ? '$499/yr found'  : 'Add annual price of $499 to Level 1 product' })
    checks.push({ name: 'Price $999/yr (L2) configured',   ok: has999,  value: has999  ? '$999/yr found'  : 'Add annual price of $999 to Level 2 product' })
    checks.push({ name: 'Price $2499/yr (L3) configured',  ok: has2499, value: has2499 ? '$2499/yr found' : 'Add annual price of $2499 to Level 3 product' })
    checks.push({ name: 'Price $49/mo (Trader) configured',ok: has49mo, value: has49mo ? '$49/mo found'   : 'Add monthly price of $49 to Trader Portal product' })
    checks.push({ name: 'Price $499/yr (Trader) configured',ok: has499y && hasTrader,
      value: (has499y && hasTrader) ? '$499/yr found' : 'Add annual price of $499 to Trader Portal product' })

    // Check planId metadata on prices
    const withPlanId = prices.data.filter(p => p.metadata?.planId)
    checks.push({
      name:  'Price metadata (planId) set',
      ok:    withPlanId.length >= 4,
      value: withPlanId.length >= 4
        ? `${withPlanId.length} price(s) have planId metadata`
        : `Only ${withPlanId.length}/5 prices have planId metadata — add planId + subscriptionType to each price`,
    })
  } catch (err) {
    checks.push({ name: 'Products check', ok: false, value: err.message })
  }

  // Check 3 — Webhook endpoint
  try {
    const webhooks = await stripe.webhookEndpoints.list({ limit: 20 })
    const myEndpoint = webhooks.data.find(w =>
      w.url.includes('mydd.work') || w.url.includes('railway.app') || w.url.includes('up.railway.app')
    )
    const hasCheckout = myEndpoint?.enabled_events?.includes('checkout.session.completed') ||
                        myEndpoint?.enabled_events?.includes('*')
    const hasInvoice  = myEndpoint?.enabled_events?.includes('invoice.paid') ||
                        myEndpoint?.enabled_events?.includes('*')

    checks.push({
      name: 'Webhook endpoint configured',
      ok: !!myEndpoint,
      value: myEndpoint ? myEndpoint.url : 'No endpoint — create at stripe.com → Developers → Webhooks',
    })
    if (myEndpoint) {
      checks.push({
        name: 'Webhook: checkout.session.completed',
        ok: !!hasCheckout,
        value: hasCheckout ? 'enabled' : 'Add event to webhook endpoint',
      })
      checks.push({
        name: 'Webhook: invoice.paid',
        ok: !!hasInvoice,
        value: hasInvoice ? 'enabled' : 'Add event to webhook endpoint',
      })
      const hasSubDeleted = myEndpoint?.enabled_events?.includes('customer.subscription.deleted') ||
                            myEndpoint?.enabled_events?.includes('*')
      checks.push({
        name: 'Webhook: customer.subscription.deleted',
        ok: !!hasSubDeleted,
        value: hasSubDeleted ? 'enabled' : 'Add event to webhook endpoint',
      })
    }
  } catch (err) {
    checks.push({ name: 'Webhook check', ok: false, value: err.message })
  }

  // Check 4 — Customer Portal
  try {
    const portal = await stripe.billingPortal.configurations.list({ limit: 1 })
    const hasPortal = portal.data.length > 0 && portal.data[0].active
    checks.push({
      name: 'Customer Portal configured',
      ok: hasPortal,
      value: hasPortal ? `active (id: ${portal.data[0].id})` : 'Activate at stripe.com → Settings → Billing → Customer portal',
    })
  } catch (err) {
    checks.push({ name: 'Customer Portal', ok: false, value: err.message })
  }

  // Check 5 — Live mode warning
  if (isLive) {
    checks.push({
      name: 'Live mode (no test keys in prod)',
      ok: true,
      value: 'LIVE key confirmed — billing is active',
    })
  } else {
    checks.push({
      name: 'Test mode (switch to live before go-live)',
      ok: false,
      value: 'Using sk_test_ key — replace with sk_live_ in Railway prod variables',
    })
  }

  // Display results
  for (const check of checks) {
    console.log(`[${check.ok ? 'OK  ' : 'FAIL'}] ${check.name}`)
    if (!check.ok || (check.value !== 'found' && check.value !== 'enabled')) {
      console.log(`       → ${check.value}`)
    }
  }

  const allOk = checks.every(c => c.ok)
  console.log('\n' + '─'.repeat(50))

  if (isLive && allOk) {
    console.log('PASS: Stripe LIVE configuration complete — ready for billing\n')
  } else if (!isLive && checks.filter(c => !c.ok).length === 1) {
    // Only the test-mode flag fails
    console.log('PASS (test mode): Stripe configuration complete — switch to sk_live_ for production\n')
  } else {
    const failed = checks.filter(c => !c.ok)
    console.log(`FAIL: ${failed.length} issue(s) to resolve before go-live\n`)
  }

  process.exit(allOk ? 0 : 1)
})()
