#!/usr/bin/env node
'use strict'
/**
 * configure-pac-memberships.js
 *
 * Creates (or updates) Stripe products and prices for PAC S2 and S3 memberships.
 * Idempotent — safe to re-run; existing products are updated, not duplicated.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/configure-pac-memberships.js
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/configure-pac-memberships.js
 */

// Load .env from backend if present (optional — key can also be passed inline)
try { require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') }) } catch (_) {}

const Stripe = require(require('path').join(__dirname, '../backend/node_modules/stripe'))

const key = process.env.STRIPE_SECRET_KEY
if (!key) { console.error('❌  STRIPE_SECRET_KEY not set'); process.exit(1) }

const stripe = Stripe(key)
const isLive = key.startsWith('sk_live_')

const SEP = '─'.repeat(50)

const MEMBERSHIPS = [
  {
    lookup_key: 'pac_s2_annual',
    name:       'MyDD PAC Certified S2 — Annual Membership',
    desc:       'Annual membership for PAC Certified (S2) agents. Includes supervision rights for up to 10 S1 agents and eligibility for monthly supervision bonus (5% of net B&E revenue).',
    unit_amount: 39900,  // $399 in cents
    currency:    'usd',
    interval:    'year',
    metadata:    { pac_tier: 'S2', max_supervised: '10', commission_rate: '0.15' },
  },
  {
    lookup_key: 'pac_s3_annual',
    name:       'MyDD PAC Senior S3 — Annual Membership',
    desc:       'Annual membership for PAC Senior (S3) agents. Includes mentoring rights for up to 5 S2 agents, L1 bonus (5%) and L2 bonus (2%) on supervised network revenue.',
    unit_amount: 79900,  // $799 in cents
    currency:    'usd',
    interval:    'year',
    metadata:    { pac_tier: 'S3', max_supervised: '5', commission_rate: '0.20' },
  },
]

async function findOrCreateProduct (membership) {
  // Search by metadata lookup_key
  const existing = await stripe.products.search({
    query: `metadata['pac_tier']:'${membership.metadata.pac_tier}' AND active:'true'`,
  })

  if (existing.data.length > 0) {
    const prod = existing.data[0]
    console.log(`  Found existing product: ${prod.id} — ${prod.name}`)
    // Update description in case it changed
    await stripe.products.update(prod.id, {
      name:        membership.name,
      description: membership.desc,
      metadata:    membership.metadata,
    })
    return prod.id
  }

  const prod = await stripe.products.create({
    name:        membership.name,
    description: membership.desc,
    metadata:    membership.metadata,
  })
  console.log(`  Created product: ${prod.id}`)
  return prod.id
}

async function findOrCreatePrice (productId, membership) {
  // Look for existing price with this lookup_key
  const existing = await stripe.prices.list({
    lookup_keys: [membership.lookup_key],
    expand:      ['data.product'],
  })

  if (existing.data.length > 0) {
    const price = existing.data[0]
    console.log(`  Found existing price: ${price.id} (${price.lookup_key}) — $${price.unit_amount / 100}/${price.recurring.interval}`)
    return price.id
  }

  const price = await stripe.prices.create({
    product:        productId,
    unit_amount:    membership.unit_amount,
    currency:       membership.currency,
    recurring:      { interval: membership.interval },
    lookup_key:     membership.lookup_key,
    transfer_lookup_key: true,
  })
  console.log(`  Created price: ${price.id} ($${price.unit_amount / 100}/${price.recurring.interval})`)
  return price.id
}

async function main () {
  console.log(`\nMyDD PAC Memberships — Stripe ${isLive ? 'LIVE' : 'TEST'} mode`)
  console.log(SEP)

  const results = []

  for (const membership of MEMBERSHIPS) {
    console.log(`\n${membership.metadata.pac_tier} — ${membership.name}`)
    const productId = await findOrCreateProduct(membership)
    const priceId   = await findOrCreatePrice(productId, membership)
    results.push({ tier: membership.metadata.pac_tier, productId, priceId, lookupKey: membership.lookup_key })
  }

  console.log(`\n${SEP}`)
  console.log('PAC Membership configuration complete:\n')

  for (const r of results) {
    console.log(`  ${r.tier}:`)
    console.log(`    Product ID : ${r.productId}`)
    console.log(`    Price ID   : ${r.priceId}`)
    console.log(`    Lookup key : ${r.lookupKey}`)
    console.log()
  }

  console.log('Add these to your Railway environment variables:')
  for (const r of results) {
    console.log(`  STRIPE_PAC_${r.tier}_PRICE_ID=${r.priceId}`)
  }
  console.log(SEP)
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1) })
