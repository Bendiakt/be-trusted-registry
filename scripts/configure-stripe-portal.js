#!/usr/bin/env node
'use strict'
/**
 * scripts/configure-stripe-portal.js — Configure le Stripe Customer Portal.
 *
 * Crée ou met à jour la configuration du portail de facturation Stripe pour
 * permettre aux clients de gérer leurs abonnements, télécharger leurs factures
 * et mettre à jour leur moyen de paiement.
 *
 * Usage :
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/configure-stripe-portal.js
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/configure-stripe-portal.js   # test mode
 *
 * Ce script est idempotent : si une configuration existe déjà, elle est mise à jour.
 */

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY manquant')
  console.error('  Usage: STRIPE_SECRET_KEY=sk_live_xxx node scripts/configure-stripe-portal.js')
  process.exit(1)
}

let Stripe
try {
  Stripe = require('../backend/node_modules/stripe')
} catch {
  console.error('Stripe SDK not found. Run: cd backend && npm install')
  process.exit(1)
}

const stripe  = new Stripe(key, { apiVersion: '2024-04-10' })
const isLive  = key.startsWith('sk_live_')
const baseUrl = isLive ? 'https://mydd.work' : 'http://localhost:5173'

;(async () => {
  console.log(`\nStripe Customer Portal — ${isLive ? 'LIVE' : 'TEST'} mode`)
  console.log('─'.repeat(50))

  // ── Check existing configuration ──────────────────────────────────────────
  const existing = await stripe.billingPortal.configurations.list({ limit: 10 })
  const active   = existing.data.filter(c => c.is_default || c.active)

  if (active.length > 0) {
    console.log(`Found ${active.length} existing configuration(s):`)
    for (const c of active) {
      console.log(`  - ${c.id} (default: ${c.is_default}, active: ${c.active})`)
    }
    console.log()
  }

  // ── Portal configuration ───────────────────────────────────────────────────
  const portalConfig = {
    business_profile: {
      headline:          'MyDD — Supplier Certification Platform',
      privacy_policy_url: `${baseUrl}/privacy`,
      terms_of_service_url: `${baseUrl}/terms`,
    },
    features: {
      // Allow customers to see & download invoices
      invoice_history: {
        enabled: true,
      },
      // Allow updating card / payment method
      payment_method_update: {
        enabled: true,
      },
      // Allow cancellation — at end of billing period (no immediate refund)
      subscription_cancel: {
        enabled:             true,
        mode:                'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: [
            'customer_service',
            'low_quality',
            'missing_features',
            'other',
            'switched_service',
            'too_complex',
            'too_expensive',
            'unused',
          ],
        },
      },
      // Allow updating quantity / pausing — disabled (fixed-tier product)
      subscription_pause: { enabled: false },
      subscription_update: {
        enabled:              true,
        default_allowed_updates: ['price', 'quantity', 'promotion_code'],
        proration_behavior:   'always_invoice',
        // Products that can be switched between (populated below from live catalog)
        products: [],
      },
    },
    default_return_url: `${baseUrl}/dashboard`,
  }

  // ── Populate switchable products from live catalog ─────────────────────────
  try {
    const products = await stripe.products.list({ active: true, limit: 100 })
    const prices   = await stripe.prices.list({ active: true, limit: 100 })

    const certProducts = products.data.filter(p =>
      p.name.toLowerCase().match(/l[123]|bronze|silver|gold|level [123]|verification|kyc|inspection/)
    )

    const switchable = certProducts.map(prod => {
      const prodPrices = prices.data
        .filter(p => p.product === prod.id && p.recurring)
        .map(p => p.id)
      return prodPrices.length ? { product: prod.id, prices: prodPrices } : null
    }).filter(Boolean)

    if (switchable.length > 0) {
      portalConfig.features.subscription_update.products = switchable
      console.log(`Switchable products found: ${switchable.length}`)
      for (const sw of switchable) {
        const prod = certProducts.find(p => p.id === sw.product)
        console.log(`  - ${prod?.name} (${sw.prices.length} price(s))`)
      }
      console.log()
    } else {
      // No products found — disable subscription update to avoid Stripe validation error
      portalConfig.features.subscription_update.enabled = false
      console.log('No switchable cert products found — subscription_update disabled')
      console.log('  Create Bronze/Silver/Gold products in Stripe Dashboard first.\n')
    }
  } catch (err) {
    console.warn('Could not load products — skipping subscription_update:', err.message)
    portalConfig.features.subscription_update.enabled = false
  }

  // ── Create or update ───────────────────────────────────────────────────────
  let config
  if (active.length > 0) {
    // Update the default configuration
    const defaultConfig = active.find(c => c.is_default) || active[0]
    console.log(`Updating existing configuration ${defaultConfig.id}...`)
    config = await stripe.billingPortal.configurations.update(defaultConfig.id, portalConfig)
    console.log('✅ Configuration updated')
  } else {
    console.log('Creating new portal configuration...')
    config = await stripe.billingPortal.configurations.create(portalConfig)
    console.log('✅ Configuration created')
  }

  console.log()
  console.log('─'.repeat(50))
  console.log('Customer Portal configuration:')
  console.log(`  ID              : ${config.id}`)
  console.log(`  Active          : ${config.active}`)
  console.log(`  Invoice history : ${config.features.invoice_history?.enabled}`)
  console.log(`  Payment update  : ${config.features.payment_method_update?.enabled}`)
  console.log(`  Cancel sub      : ${config.features.subscription_cancel?.enabled} (${config.features.subscription_cancel?.mode})`)
  console.log(`  Sub update      : ${config.features.subscription_update?.enabled}`)
  console.log(`  Return URL      : ${config.default_return_url}`)
  console.log('─'.repeat(50))
  console.log()

  if (isLive) {
    console.log('✅ LIVE Customer Portal is ready.')
    console.log(`   Customers can manage billing at: ${baseUrl}/dashboard`)
    console.log('   Backend endpoint: POST /api/payments/portal\n')
  } else {
    console.log('✅ TEST Customer Portal configured.')
    console.log('   Re-run with sk_live_ key to apply to production.\n')
  }

  process.exit(0)
})().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
