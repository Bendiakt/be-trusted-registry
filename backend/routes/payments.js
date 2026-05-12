const express = require('express')
const router = express.Router()
const Stripe = require('stripe')
const { query } = require('../db')
const { checkFraud } = require('../lib/fraudDetection')
const { sendPaymentConfirmation } = require('../lib/mailer')
const { isBlockedCompany } = require('../lib/blocklist')

const levelFromPlanId = (planId) => {
  const map = { level1: 1, level2: 2, level3: 3 }
  return map[planId] || null
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
    const companyResult = await query('SELECT id, name FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    const userCompany = companyResult.rows[0]
    if (!userCompany) {
      return res.status(400).json({ error: 'Register your company profile before checkout' })
    }

    // Block operator's own entities from purchasing certification
    if (isBlockedCompany(userCompany.name)) {
      return res.status(403).json({ error: 'This company cannot be certified on this platform.' })
    }

    const resolvedCompanyId = String(userCompany.id)

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: plan.name, description: 'MyDD Certification' },
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

      // Update company certification level + mark verified + store Stripe customer_id
      await query(
        `UPDATE companies
         SET certification_level = GREATEST(certification_level, $1),
             verified_at = COALESCE(verified_at, NOW()),
             stripe_customer_id = COALESCE(stripe_customer_id, $3),
             updated_at = NOW()
         WHERE id = $2`,
        [planLevel, resolvedCompanyId, session.customer || null]
      )

      // Stamp certification with granted_at and expires_at (1 year)
      if (effectiveCertificationId) {
        await query(
          `UPDATE certifications
           SET status = 'active',
               granted_at = COALESCE(granted_at, NOW()),
               expires_at = COALESCE(expires_at, NOW() + INTERVAL '1 year'),
               updated_at = NOW()
           WHERE id = $1`,
          [effectiveCertificationId]
        )
      }

      const companyResult = await query('SELECT user_id FROM companies WHERE id = $1 LIMIT 1', [resolvedCompanyId])
      companyUserId = companyResult.rows[0]?.user_id || resolvedUserId || null

      console.log(JSON.stringify({
        event: 'company.certification.upgraded',
        companyId: resolvedCompanyId,
        certificationLevel: planLevel,
        certificationId: effectiveCertificationId,
        stripeEventId: event.id,
      }))

      const companyNameResult = await query('SELECT name, country FROM companies WHERE id = $1 LIMIT 1', [resolvedCompanyId])
      const companyRow = companyNameResult.rows[0] || {}

      // Level 3: auto-create a PAC site inspection mission (one per company max)
      if (planLevel === 3) {
        await query(
          `INSERT INTO missions (company_id, company_name, location, type, description, status, fee_usd)
           SELECT $1, $2, $3, 'site_inspection', $4, 'available', 500
           WHERE NOT EXISTS (
             SELECT 1 FROM missions WHERE company_id = $1 AND type = 'site_inspection'
           )`,
          [
            resolvedCompanyId,
            companyRow.name || null,
            companyRow.country || null,
            `Site inspection for Level 3 certification — ${companyRow.name || 'company #' + resolvedCompanyId}`,
          ]
        ).catch((e) => console.error('Mission auto-create error:', e.message))
        console.log(JSON.stringify({ event: 'mission.created', companyId: resolvedCompanyId, level: 3 }))
      }

      await sendPaymentConfirmation({
        email: session.customer_details?.email || session.customer_email || null,
        amountCents: session.amount_total || 0,
        level: planLevel,
        companyName: companyRow.name || null,
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

// POST /api/payments/portal — Stripe Customer Portal for billing history & receipts
router.post('/portal', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const stripe = getStripe()

    // Look up stripe_customer_id stored on their company
    const companyResult = await query(
      'SELECT stripe_customer_id FROM companies WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    )
    let customerId = companyResult.rows[0]?.stripe_customer_id

    // Fallback: search Stripe by email
    if (!customerId && req.user.email) {
      const customers = await stripe.customers.list({ email: req.user.email, limit: 1 })
      if (customers.data.length) {
        customerId = customers.data[0].id
        // Persist for next time
        if (companyResult.rows[0]) {
          await query(
            'UPDATE companies SET stripe_customer_id = $1 WHERE user_id = $2',
            [customerId, req.user.id]
          ).catch(() => {})
        }
      }
    }

    if (!customerId) {
      return res.status(404).json({ error: 'No billing account found. Complete a payment first.' })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('Billing portal error:', err.message)
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Billing portal unavailable. Please contact support.' })
    }
    res.status(500).json({ error: 'Failed to open billing portal' })
  }
})

// ── POST /api/payments/renewal-checkout ──────────────────────────────────────
// Creates a Stripe Checkout session specifically for renewing an active or
// recently-expired certification. The new session links to the existing cert
// so the webhook can extend expires_at rather than creating a duplicate cert.
router.post('/renewal-checkout', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const companyResult = await query(
      'SELECT id, name FROM companies WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    )
    const company = companyResult.rows[0]
    if (!company) return res.status(400).json({ error: 'No company profile found' })

    if (isBlockedCompany(company.name)) {
      return res.status(403).json({ error: 'This company cannot be certified on this platform.' })
    }

    // Find the most recent cert that is active or expired (reneweable)
    const certResult = await query(
      `SELECT id, level, status, expires_at
         FROM certifications
        WHERE company_id = $1
          AND status IN ('active', 'expired')
        ORDER BY created_at DESC
        LIMIT 1`,
      [company.id]
    )
    const cert = certResult.rows[0]
    if (!cert) return res.status(404).json({ error: 'No certification eligible for renewal' })

    const planMap = { 1: 'level1', 2: 'level2', 3: 'level3' }
    const planId  = planMap[cert.level]
    const plan    = PLANS[planId]
    if (!plan) return res.status(400).json({ error: 'Unknown certification level' })

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name:        `${plan.name} — Renewal`,
            description: `Renewing certification for ${company.name}`,
          },
          unit_amount: plan.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=success&plan=${planId}&renewal=1`,
      cancel_url:  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=cancelled`,
      metadata: {
        planId,
        companyId:       String(company.id),
        userId:          String(req.user.id),
        certificationId: String(cert.id),
        isRenewal:       'true',
      },
      customer_email: req.user.email || undefined,
    })

    await query(
      `INSERT INTO payments (user_id, company_id, stripe_session_id, amount_cents, currency, plan_id, status, certification_id)
       VALUES ($1, $2, $3, $4, 'usd', $5, 'pending', $6)
       ON CONFLICT (stripe_session_id) DO NOTHING`,
      [req.user.id, company.id, session.id, plan.price, planId, cert.id]
    )

    res.json({ url: session.url, certId: cert.id, level: cert.level })
  } catch (err) {
    console.error('Renewal checkout error:', err.message)
    if (err.message === 'Missing STRIPE_SECRET_KEY') {
      return res.status(500).json({ error: 'Server payment configuration is incomplete' })
    }
    res.status(500).json({ error: 'Failed to create renewal session' })
  }
})

module.exports = { router }
