const express = require('express')
const router = express.Router()
const Stripe = require('stripe')
const { query } = require('../db')

let _stripe = null
const getStripe = () => {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Missing STRIPE_SECRET_KEY')
    }
    _stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      timeout: 15000,
    })
  }
  return _stripe
}

const PLANS = {
  level1: { name: 'B&E Level 1 — Document Verification', price: 49000 },
  level2: { name: 'B&E Level 2 — KYC Full Validation', price: 99000 },
  level3: { name: 'B&E Level 3 — Physical Site Inspection', price: 249000 },
}

router.post('/create-checkout-session', async (req, res) => {
  try {
    const { planId } = req.body
    const plan = PLANS[planId]
    if (!plan) return res.status(400).json({ error: 'Invalid plan' })

    // Resolve companyId from authenticated user (req.user set by auth middleware)
    const companyResult = await query('SELECT id FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    const userCompany = companyResult.rows[0]
    if (!userCompany) {
      return res.status(400).json({ error: 'Register your company profile before checkout' })
    }
    const resolvedCompanyId = String(userCompany.id)

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: plan.name, description: 'B&E Trusted Registry Certification' },
          unit_amount: plan.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=success&plan=${planId}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=cancelled`,
      metadata: { planId, companyId: resolvedCompanyId },
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('Stripe error:', err.message, err.code, err.type)
    if (err.message === 'Missing STRIPE_SECRET_KEY') {
      return res.status(500).json({ error: 'Server payment configuration is incomplete' })
    }

    if (err.type === 'StripeConnectionError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Payment provider is temporarily unreachable. Please retry in a minute.' })
    }

    if (err.type === 'StripeAuthenticationError') {
      return res.status(500).json({ error: 'Payment configuration is invalid. Please contact support.' })
    }

    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Invalid payment request. Please refresh and try again.' })
    }

    res.status(500).json({ error: 'Payment session failed. Please try again later.' })
  }
})

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']

  // Early guard: stripe-signature header must be present
  if (!sig) {
    console.warn('Webhook rejected: missing stripe-signature header', {
      timestamp: new Date().toISOString(),
      path: '/api/payments/webhook',
      reason: 'missing_header'
    })
    return res.status(400).send('Missing stripe-signature header')
  }

  let event
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(500).send('Missing STRIPE_WEBHOOK_SECRET')
    }
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '')
    console.log(JSON.stringify({
      event: 'stripe.webhook.received',
      stripeEventId: event.id,
      stripeEventType: event.type,
    }))
  } catch (err) {
    console.warn('Webhook signature verification failed', {
      timestamp: new Date().toISOString(),
      error: err.message,
      code: err.code
    })
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const { planId, companyId } = session.metadata || {}
      console.log(JSON.stringify({
        event: 'stripe.payment.confirmed',
        message: 'webhook event received',
        stripeEventId: event.id,
        sessionId: session.id,
        planId,
        companyId,
        amountTotal: session.amount_total,
        currency: session.currency,
      }))

      // Update company certification level
      if (companyId) {
        const levelMap = { level1: 1, level2: 2, level3: 3 }
        const newLevel = levelMap[planId]
        if (newLevel) {
          await query(
            `UPDATE companies
             SET certification_level = GREATEST(certification_level, $1),
                 updated_at = NOW()
             WHERE id = $2`,
            [newLevel, parseInt(companyId, 10)]
          )
          console.log(JSON.stringify({
            event: 'company.certification.upgraded',
            companyId,
            certificationLevel: newLevel,
            stripeEventId: event.id,
          }))
        }
      }
    }
    res.json({ received: true })
  } catch (err) {
    console.error('Webhook processing error:', err.message)
    res.status(500).send('Webhook processing failed')
  }
})

module.exports = { router }
