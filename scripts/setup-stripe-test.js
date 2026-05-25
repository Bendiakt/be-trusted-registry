#!/usr/bin/env node
'use strict'
/**
 * setup-stripe-test.js
 *
 * Bootstraps the Stripe TEST environment to mirror production:
 *   - Creates L1/L2/L3 + Trader products with correct planId metadata
 *   - Creates all prices ($499/yr, $999/yr, $2499/yr, $49/mo, $499/yr trader)
 *   - Creates PAC S2/S3 membership products + prices
 *   - Configures Customer Portal (test mode)
 *   - Creates webhook endpoint pointing to staging backend
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_xxx STAGING_URL=https://api-staging.mydd.work \
 *     node scripts/setup-stripe-test.js
 *
 * STAGING_URL defaults to the Railway staging URL if not set.
 */

try { require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') }) } catch (_) {}

const Stripe = require(require('path').join(__dirname, '../backend/node_modules/stripe'))

const key = process.env.STRIPE_SECRET_KEY
if (!key) { console.error('❌  STRIPE_SECRET_KEY not set'); process.exit(1) }
if (!key.startsWith('sk_test_')) { console.error('❌  This script requires a TEST key (sk_test_xxx)'); process.exit(1) }

const stripe       = Stripe(key, { apiVersion: '2024-04-10' })
const STAGING_URL  = (process.env.STAGING_URL || 'https://api-staging.mydd.work').replace(/\/$/, '')
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://mydd.work'
const SEP = '─'.repeat(54)

// ── Product definitions ───────────────────────────────────────────────────────
const PRODUCTS = [
  {
    key:         'l1_bronze',
    name:        'MyDD Level 1 — Bronze',
    description: 'Annual supplier certification L1 — Document Verification',
    metadata:    { level: '1', planId: 'l1_bronze' },
    prices: [
      { unit_amount: 49900, currency: 'usd', interval: 'year', lookup_key: 'l1_bronze_annual',
        metadata: { planId: 'l1_bronze', subscriptionType: 'certification' } },
    ],
  },
  {
    key:         'l2_silver',
    name:        'MyDD Level 2 — Silver',
    description: 'Annual supplier certification L2 — Enhanced KYC',
    metadata:    { level: '2', planId: 'l2_silver' },
    prices: [
      { unit_amount: 99900, currency: 'usd', interval: 'year', lookup_key: 'l2_silver_annual',
        metadata: { planId: 'l2_silver', subscriptionType: 'certification' } },
    ],
  },
  {
    key:         'l3_gold',
    name:        'MyDD Level 3 — Gold',
    description: 'Annual supplier certification L3 — Site Inspection',
    metadata:    { level: '3', planId: 'l3_gold' },
    prices: [
      { unit_amount: 249900, currency: 'usd', interval: 'year', lookup_key: 'l3_gold_annual',
        metadata: { planId: 'l3_gold', subscriptionType: 'certification' } },
    ],
  },
  {
    key:         'trader_portal',
    name:        'MyDD Trader Portal',
    description: 'Access to the verified supplier registry — monthly or annual',
    metadata:    { planId: 'trader_portal' },
    prices: [
      { unit_amount: 4900, currency: 'usd', interval: 'month', lookup_key: 'trader_monthly',
        metadata: { planId: 'trader_monthly', subscriptionType: 'trader' } },
      { unit_amount: 49900, currency: 'usd', interval: 'year', lookup_key: 'trader_annual',
        metadata: { planId: 'trader_annual', subscriptionType: 'trader' } },
    ],
  },
  {
    key:         'pac_s2',
    name:        'MyDD PAC Certified S2 — Annual Membership',
    description: 'Annual membership for PAC Certified agents. Supervision rights for up to 10 S1 agents.',
    metadata:    { pac_tier: 'S2', planId: 'pac_s2_annual' },
    prices: [
      { unit_amount: 39900, currency: 'usd', interval: 'year', lookup_key: 'pac_s2_annual',
        metadata: { planId: 'pac_s2_annual', subscriptionType: 'pac_membership', pac_tier: 'S2' } },
    ],
  },
  {
    key:         'pac_s3',
    name:        'MyDD PAC Senior S3 — Annual Membership',
    description: 'Annual membership for PAC Senior agents. Mentoring rights for up to 5 S2 agents.',
    metadata:    { pac_tier: 'S3', planId: 'pac_s3_annual' },
    prices: [
      { unit_amount: 79900, currency: 'usd', interval: 'year', lookup_key: 'pac_s3_annual',
        metadata: { planId: 'pac_s3_annual', subscriptionType: 'pac_membership', pac_tier: 'S3' } },
    ],
  },
]

// ── Webhook events ────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'payment_intent.payment_failed',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
async function findOrCreateProduct (def) {
  const existing = await stripe.products.list({ active: true, limit: 100 })
  const found    = existing.data.find(p => p.metadata?.planId === def.metadata.planId)

  if (found) {
    await stripe.products.update(found.id, { name: def.name, description: def.description, metadata: def.metadata })
    console.log(`  ♻️  Updated  product ${found.id} — ${def.name}`)
    return found.id
  }

  const prod = await stripe.products.create({ name: def.name, description: def.description, metadata: def.metadata })
  console.log(`  ✅ Created product ${prod.id} — ${def.name}`)
  return prod.id
}

async function findOrCreatePrice (productId, priceDef) {
  // Check by lookup_key
  const existing = await stripe.prices.list({ lookup_keys: [priceDef.lookup_key], expand: ['data.product'] })

  if (existing.data.length > 0) {
    const p = existing.data[0]
    console.log(`     ♻️  Price exists ${p.id} ($${p.unit_amount / 100}/${p.recurring?.interval}) [${priceDef.lookup_key}]`)
    return p.id
  }

  const price = await stripe.prices.create({
    product:    productId,
    unit_amount: priceDef.unit_amount,
    currency:   priceDef.currency,
    recurring:  { interval: priceDef.interval },
    lookup_key: priceDef.lookup_key,
    transfer_lookup_key: true,
    metadata:   priceDef.metadata,
  })
  console.log(`     ✅ Created price ${price.id} ($${price.unit_amount / 100}/${price.recurring?.interval}) [${priceDef.lookup_key}]`)
  return price.id
}

async function setupWebhook () {
  const webhookUrl = `${STAGING_URL}/api/payments/webhook`
  const existing   = await stripe.webhookEndpoints.list({ limit: 20 })
  const found      = existing.data.find(w => w.url === webhookUrl)

  if (found) {
    // Update events if needed
    const hasAll = WEBHOOK_EVENTS.every(e => found.enabled_events.includes(e) || found.enabled_events.includes('*'))
    if (!hasAll) {
      await stripe.webhookEndpoints.update(found.id, { enabled_events: WEBHOOK_EVENTS })
      console.log(`  ♻️  Updated webhook ${found.id} — events synced`)
    } else {
      console.log(`  ♻️  Webhook exists ${found.id} — ${webhookUrl}`)
    }
    console.log(`  ⚠️  Webhook secret: retrieve from Stripe Dashboard (cannot re-read via API)`)
    console.log(`      → stripe.com → Developers → Webhooks → ${found.id} → Signing secret`)
    return found.id
  }

  const wh = await stripe.webhookEndpoints.create({
    url:            webhookUrl,
    enabled_events: WEBHOOK_EVENTS,
    description:    'MyDD staging webhook',
  })
  console.log(`  ✅ Created webhook ${wh.id} — ${webhookUrl}`)
  console.log(`  🔑 Webhook secret: ${wh.secret}`)
  console.log(`     → Add STRIPE_WEBHOOK_SECRET=${wh.secret} to Railway staging variables`)
  return wh.id
}

async function setupPortal (priceIds) {
  const existing = await stripe.billingPortal.configurations.list({ limit: 1 })

  const features = {
    invoice_history:    { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'other'] } },
    subscription_update: {
      enabled:        true,
      default_allowed_updates: ['price'],
      proration_behavior:      'create_prorations',
      products: priceIds
        .filter(p => p.interval === 'year' || p.interval === 'month')
        .slice(0, 3)
        .map(p => ({ product: p.productId, prices: [p.priceId] })),
    },
  }

  if (existing.data.length > 0) {
    const cfg = await stripe.billingPortal.configurations.update(existing.data[0].id, {
      features,
      business_profile: { return_url: `${FRONTEND_URL}/dashboard` },
    })
    console.log(`  ♻️  Updated Customer Portal ${cfg.id}`)
    return cfg.id
  }

  const cfg = await stripe.billingPortal.configurations.create({
    business_profile: { return_url: `${FRONTEND_URL}/dashboard` },
    features,
  })
  console.log(`  ✅ Created Customer Portal ${cfg.id}`)
  return cfg.id
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main () {
  console.log(`\nMyDD Stripe TEST environment setup`)
  console.log(`Staging URL : ${STAGING_URL}`)
  console.log(SEP)

  // 1. Products + prices
  console.log('\n📦 Products & Prices')
  const priceResults = []

  for (const def of PRODUCTS) {
    console.log(`\n  ${def.name}`)
    const productId = await findOrCreateProduct(def)
    for (const priceDef of def.prices) {
      const priceId = await findOrCreatePrice(productId, priceDef)
      priceResults.push({ productId, priceId, ...priceDef })
    }
  }

  // 2. Webhook
  console.log(`\n🔔 Webhook → ${STAGING_URL}/api/payments/webhook`)
  await setupWebhook()

  // 3. Customer Portal
  console.log('\n🏦 Customer Portal')
  await setupPortal(priceResults)

  // 4. Summary
  console.log(`\n${SEP}`)
  console.log('✅ Stripe TEST environment ready\n')
  console.log('Price IDs to add to Railway staging variables:')

  const varMap = {
    'l1_bronze_annual':  'STRIPE_PRICE_L1',
    'l2_silver_annual':  'STRIPE_PRICE_L2',
    'l3_gold_annual':    'STRIPE_PRICE_L3',
    'trader_monthly':    'STRIPE_PRICE_TRADER_MONTHLY',
    'trader_annual':     'STRIPE_PRICE_TRADER_ANNUAL',
    'pac_s2_annual':     'STRIPE_PAC_S2_PRICE_ID',
    'pac_s3_annual':     'STRIPE_PAC_S3_PRICE_ID',
  }

  for (const p of priceResults) {
    const varName = varMap[p.lookup_key]
    if (varName) console.log(`  ${varName}=${p.priceId}`)
  }

  console.log('\nRun verify-stripe.js with test key to confirm:')
  console.log('  STRIPE_SECRET_KEY=sk_test_xxx node scripts/verify-stripe.js')
  console.log(SEP)
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1) })
