const express = require('express')
const router = express.Router()
const Stripe = require('stripe')

// Import shared data (in production, use a database)
let companies = []
const setCompanies = (companiesArray) => { companies = companiesArray }

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')

const PLANS = {
  level1: { name: 'B&E Level 1 — Document Verification', price: 49000 },
  level2: { name: 'B&E Level 2 — KYC Full Validation', price: 99000 },
  level3: { name: 'B&E Level 3 — Physical Site Inspection', price: 249000 },
}

router.post('/checkout', async (req, res) => {
  try {
    const { planId, companyId } = req.body
    const plan = PLANS[planId]
    if (!plan) return res.status(400).json({ error: 'Invalid plan' })

    const session = await stripe.checkout.sessions.create({
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
      metadata: { planId, companyId: String(companyId || '') },
    })
    res.json({ url: session.url })
  } catch (err) {
    console.error('Stripe error:', err.message)
    res.status(500).json({ error: 'Payment session failed' })
  }
})

router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '')
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    console.log('Payment confirmed:', session.metadata)
    
    // Update company certification level
    const { planId, companyId } = session.metadata
    if (companyId) {
      const company = companies.find(c => c.id === parseInt(companyId))
      if (company) {
        const levelMap = { level1: 1, level2: 2, level3: 3 }
        company.level = levelMap[planId] || company.level
        company.badge = company.level > 0 ? 'certified' : 'not-certified'
        console.log(`Company ${companyId} upgraded to level ${company.level}`)
      }
    }
  }
  res.json({ received: true })
})

module.exports = { router, setCompanies }
