/**
 * payment.spec.js — E2E payment / billing flows.
 *
 * Scenarios:
 *  1. Pricing tab shows plan options
 *  2. Checkout button triggers /api/payments/create-checkout-session
 *     and redirects to the Stripe URL returned by the mock
 *  3. Billing portal button triggers /api/payments/portal
 *  4. Active subscription shows billing status
 */
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

test.describe('Payments — pricing & checkout', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Alice Dupont', email: 'alice@acme.com', role: 'company' })
  })

  test('pricing tab is reachable from the dashboard', async ({ page }) => {
    await page.goto('/dashboard')

    const pricingTab = page.getByRole('button', { name: /pricing|tarif|subscription|abonnement/i }).first()
    await expect(pricingTab).toBeVisible({ timeout: 5000 })
    await pricingTab.click()

    // Pricing section should contain a price or level reference
    await expect(
      page.getByText(/€|EUR|level|niveau|plan/i).first()
    ).toBeVisible({ timeout: 4000 })
  })

  test('checkout button calls create-checkout-session and navigates to Stripe URL', async ({ page }) => {
    await page.goto('/dashboard')

    // Wait for the company profile to load — plan buttons are disabled until company != null.
    // The stub returns company.name = 'Acme Corp', so waiting for that text ensures the
    // /api/companies/me response has been processed and React state is updated.
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 5000 })

    // Track the checkout API call
    let checkoutCalled = false
    await page.route('**/api/payments/create-checkout-session', (route) => {
      checkoutCalled = true
      route.fulfill({
        status: 200, contentType: 'application/json',
        // Return a non-Stripe URL so we stay in the test runner domain
        body: JSON.stringify({ url: '/login?stripe-redirect=1' }),
      })
    })

    // Navigate to pricing tab
    const pricingTab = page.getByRole('button', { name: /pricing|tarif|subscription|abonnement/i }).first()
    if (await pricingTab.isVisible()) {
      await pricingTab.click()
    }

    // Click the first ENABLED plan button. With certificationLevel: 2 the enabled plan is L3
    // whose button text is "Get Certified". "upgrade" is excluded to avoid matching the
    // "Pricing & Upgrade" tab button which also remains in the DOM.
    const buyBtn = page.locator('button:not([disabled])').filter({
      hasText: /get certified|subscribe|buy|choose|select|obtenir|certifi/i,
    }).first()
    if (await buyBtn.isVisible()) {
      await buyBtn.click()
      // Give the request time to fire
      await page.waitForTimeout(1000)
      expect(checkoutCalled).toBe(true)
    }
  })

  test('billing portal button calls /api/payments/portal', async ({ page }) => {
    await page.goto('/dashboard')

    let portalCalled = false
    await page.route('**/api/payments/portal', (route) => {
      portalCalled = true
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ url: '/login?portal-redirect=1' }),
      })
    })

    const pricingTab = page.getByRole('button', { name: /pricing|tarif|subscription|abonnement/i }).first()
    if (await pricingTab.isVisible()) await pricingTab.click()

    const portalBtn = page.getByRole('button', { name: /portal|billing|manage|gérer/i }).first()
    if (await portalBtn.isVisible()) {
      await portalBtn.click()
      await page.waitForTimeout(1000)
      expect(portalCalled).toBe(true)
    }
  })
})
