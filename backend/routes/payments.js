const express = require('express')
const router = express.Router()
const Stripe = require('stripe')
const { query } = require('../db')
const { checkFraud } = require('../lib/fraudDetection')

const levelFromPlanId = (planId) => {
  const map = { level1: 1, level2: 2, level3: 3 }
  return map[planId] || null
}

const sendPaymentConfirmationEmail = async ({ email, amountCents, level }) => {
  if (!email) return
  // Placeholder integration point (SES/SendGrid/Resend). We keep it non-blocking.
  console.log(JSON.stringify({
    event: 'payment.email.queued',
    email,
    amountUsd: (amountCents || 0) / 100,
    level,
  }))
}

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
    const { planId, certificationId } = req.body
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
      metadata: {
        planId,
        companyId: resolvedCompanyId,
        userId: String(req.user.id),
        certificationId: certificationId ? String(certificationId) : '',
      },
      customer_email: req.user.email || undefined,
    })

    await query(
      `INSERT INTO payments (user_id, company_id, stripe_session_id, amount_cents, currency, plan_id, status, certification_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       ON CONFLICT (stripe_session_id)
       DO UPDATE SET
         amount_cents = EXCLUDED.amount_cents,
         currency = EXCLUDED.currency,
         plan_id = EXCLUDED.plan_id,
         certification_id = EXCLUDED.certification_id,
         updated_at = NOW()`,
      [req.user.id, parseInt(resolvedCompanyId, 10), session.id, plan.price, 'usd', planId, certificationId || null]
    )

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
      const { planId, companyId, certificationId, userId } = session.metadata || {}
      const planLevel = levelFromPlanId(planId)
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

      const resolvedCompanyId = companyId ? parseInt(companyId, 10) : null
      const resolvedUserId = userId ? parseInt(userId, 10) : null

      await query(
        `UPDATE payments
         SET status = 'completed',
             stripe_payment_intent_id = $1,
             updated_at = NOW()
         WHERE stripe_session_id = $2`,
        [session.payment_intent ? String(session.payment_intent) : null, session.id]
      )

      if (!resolvedCompanyId || !planLevel) {
        return res.json({ received: true })
      }

      let effectiveCertificationId = certificationId ? parseInt(certificationId, 10) : null
      if (effectiveCertificationId) {
        await query(
          `UPDATE certifications
           SET status = 'submitted',
               payment_confirmed = TRUE,
               level = GREATEST(level, $1),
               updated_at = NOW()
           WHERE id = $2`,
          [planLevel, effectiveCertificationId]
        )
      } else {
        const createdCert = await query(
          `INSERT INTO certifications (company_id, level, status, payment_confirmed)
           VALUES ($1, $2, 'submitted', TRUE)
           RETURNING id`,
          [resolvedCompanyId, planLevel]
        )
        effectiveCertificationId = createdCert.rows[0].id
      }

      await query(
        `UPDATE payments
         SET certification_id = COALESCE(certification_id, $1),
             updated_at = NOW()
         WHERE stripe_session_id = $2`,
        [effectiveCertificationId, session.id]
      )

      let companyUserId = null

      // Update company certification level
      await query(
        `UPDATE companies
         SET certification_level = GREATEST(certification_level, $1),
             updated_at = NOW()
         WHERE id = $2`,
        [planLevel, resolvedCompanyId]
      )

      const companyResult = await query('SELECT user_id FROM companies WHERE id = $1 LIMIT 1', [resolvedCompanyId])
      companyUserId = companyResult.rows[0]?.user_id || resolvedUserId || null

      console.log(JSON.stringify({
        event: 'company.certification.upgraded',
        companyId: resolvedCompanyId,
        certificationLevel: planLevel,
        certificationId: effectiveCertificationId,
        stripeEventId: event.id,
      }))

      await sendPaymentConfirmationEmail({
        email: session.customer_details?.email || session.customer_email || null,
        amountCents: session.amount_total || 0,
        level: planLevel,
      })

      // Stripe Radar + dispute risk signals (if payment_intent is available)
      let stripeRiskLevel = null
      let stripeDisputed = false
      if (session.payment_intent) {
        try {
          const pi = await getStripe().paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge'] })
          const latestCharge = pi.latest_charge
          stripeRiskLevel = latestCharge?.outcome?.risk_level || null
          stripeDisputed = Boolean(latestCharge?.disputed)
          console.log(JSON.stringify({
            event: 'stripe.risk.signal',
            stripeEventId: event.id,
            paymentIntent: session.payment_intent,
            riskLevel: stripeRiskLevel,
            disputed: stripeDisputed,
          }))
        } catch (riskErr) {
          console.warn('Unable to fetch Stripe risk signal:', riskErr.message)
        }
      }

      await checkFraud({
        userId: companyUserId,
        companyId: companyId ? parseInt(companyId, 10) : null,
        action: 'stripe_webhook',
        stripeRiskLevel,
        stripeDisputed,
      }).catch((fraudErr) => {
        console.error('Stripe fraud check error:', fraudErr.message)
      })
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object
      await query(
        `UPDATE payments
         SET status = 'failed',
             stripe_payment_intent_id = $1,
             updated_at = NOW()
         WHERE stripe_payment_intent_id = $1 OR stripe_session_id = $2`,
        [String(pi.id), pi.metadata?.checkout_session_id || '']
      )
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object
      await query(
        `UPDATE payments
         SET status = 'refunded',
             updated_at = NOW()
         WHERE stripe_payment_intent_id = $1`,
        [String(charge.payment_intent || '')]
      )
    }

    res.json({ received: true })
  } catch (err) {
    console.error('Webhook processing error:', err.message)
    res.status(500).send('Webhook processing failed')
  }
})

router.get('/stats', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const stats = await query('SELECT * FROM revenue_stats LIMIT 1')
    const row = stats.rows[0] || {
      revenue_total_cents: 0,
      revenue_total_usd: 0,
      payments_completed: 0,
    }
    res.json({
      revenue_total_cents: parseInt(row.revenue_total_cents || '0', 10),
      revenue_total_usd: parseFloat(row.revenue_total_usd || 0),
      payments_completed: parseInt(row.payments_completed || '0', 10),
    })
  } catch (err) {
    console.error('Payments stats error:', err.message)
    res.status(500).json({ error: 'Failed to load payment stats' })
  }
})

module.exports = { router }
