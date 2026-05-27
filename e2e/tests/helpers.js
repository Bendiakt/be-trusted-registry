/**
 * helpers.js — shared utilities for MyDD Playwright E2E tests.
 */

/** sessionStorage key used by frontend/src/lib/session.js */
const SESSION_KEY = 'mydd_user'

/**
 * Inject a fake user session into sessionStorage so protected pages
 * skip the /api/auth/me call and render immediately.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} user - { id, name, email, role }
 */
async function seedSession(page, user) {
  await page.evaluate(
    ([key, value]) => sessionStorage.setItem(key, value),
    [SESSION_KEY, JSON.stringify(user)],
  )
}

/**
 * Stub ALL /api/* requests so tests never hit a real backend.
 * Routes registered here act as the default; individual tests can
 * override specific paths by calling page.route() before navigation.
 *
 * @param {import('@playwright/test').Page} page
 */
async function stubApi(page) {
  // Catch-all FIRST — Playwright matches routes LIFO (last-registered wins),
  // so registering the catch-all first lets every specific stub below override it.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not mocked' }) }),
  )

  // CSRF seed
  await page.route('**/api/auth/csrf-token', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  )

  // Auth
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ user: { id: 1, name: 'Test User', email: 'test@example.com', role: 'company' } }),
    }),
  )
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) }),
  )
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'expired' }) }),
  )

  // Companies
  await page.route('**/api/companies/me', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        company: {
          id: 10, name: 'Acme Corp', companyName: 'Acme Corp',
          sector: 'Manufacturing', country: 'FR',
          status: 'active', certificationLevel: 2,
        },
        user: { id: 1, name: 'Test User', email: 'test@example.com', role: 'company' },
      }),
    }),
  )

  // Registry (public) — field names match PublicRegistry.jsx: c.name, c.level
  await page.route('**/api/registry**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, name: 'Acme Corp', sector: 'Manufacturing', country: 'FR', level: 2 },
          { id: 11, name: 'Beta Ltd',  sector: 'Logistics',     country: 'DE', level: 1 },
        ],
        pagination: { page: 1, limit: 20, total: 2, pages: 1 },
      }),
    }),
  )

  // Verify — field names match Verify.jsx: data.level, data.status, data.badge (flat, not nested)
  await page.route('**/api/verify/**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 10, companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR',
        level: 2, status: 'active', badge: 'Level 2 — KYC Validated',
        grantedAt: '2025-01-01T00:00:00Z',
        expiresAt: '2026-01-01T00:00:00Z',
        daysLeft: 200, expiringSoon: false, expired: false,
      }),
    }),
  )

  // Admin stats — field names match AdminPanel.jsx: stats.users.total, stats.companies.total
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        users:     { total: 42, last_30d: 5 },
        companies: { total: 18, certified: 15 },
        revenue:   { total_usd: 0 },
      }),
    }),
  )
  // Admin companies — field names match AdminPanel.jsx: c.company_name || c.name, c.certification_level
  await page.route('**/api/admin/companies**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, company_name: 'Acme Corp', sector: 'Manufacturing', country: 'FR', certification_level: 2, status: 'active' },
        ],
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      }),
    }),
  )
  await page.route('**/api/admin/users**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 1, name: 'Test User', email: 'test@example.com', role: 'company' },
        ],
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      }),
    }),
  )
  await page.route('**/api/admin/missions**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      }),
    }),
  )

  // PAC earnings
  await page.route('**/api/pac/earnings', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        summary: {
          totalEarnedCents: 5000, totalEarnedUsd: 50.00,
          pendingCents: 7500, pendingUsd: 75.00,
          commissionRate: 0.10, commissionPct: 10, pacTier: 'S1',
          completedCount: 3, paidCount: 1,
        },
        missions: [
          { id: 42, companyName: 'Acme Corp', location: 'Paris, FR', type: 'site_inspection',
            feeUsd: 500, commissionCents: 5000, commissionUsd: 50.00,
            paymentConfirmedAt: '2026-05-01T10:00:00Z', status: 'completed',
            outcome: 'pass', completedAt: '2026-04-30T00:00:00Z', createdAt: '2026-04-01T00:00:00Z' },
          { id: 43, companyName: 'Beta Ltd', location: 'Lyon, FR', type: 'site_inspection',
            feeUsd: 500, commissionCents: 5000, commissionUsd: 50.00,
            paymentConfirmedAt: null, status: 'completed',
            outcome: 'pass', completedAt: '2026-05-10T00:00:00Z', createdAt: '2026-04-15T00:00:00Z' },
        ],
      }),
    }),
  )

  // Payments
  await page.route('**/api/payments/create-checkout-session', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ url: 'https://checkout.stripe.com/test-session' }),
    }),
  )
  await page.route('**/api/payments/portal', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ url: 'https://billing.stripe.com/test-portal' }),
    }),
  )
  await page.route('**/api/payments/stats', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ plan: 'level2', nextBillingDate: '2026-06-01', status: 'active' }),
    }),
  )
  // Mission fee checkout — returns a safe redirect URL (stays in test runner)
  await page.route('**/api/payments/mission-checkout', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ url: '/login?stripe-mission-redirect=1' }),
    }),
  )

  // Company missions (audits tab) — one unpaid + one paid mission
  await page.route('**/api/companies/missions**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        missions: [
          {
            id: 42, company_name: 'Acme Corp', location: 'Paris, FR',
            type: 'site_inspection', status: 'assigned', outcome: null,
            feeUsd: 500, paymentConfirmedAt: null,
            createdAt: '2026-04-01T00:00:00Z', completedAt: null,
          },
          {
            id: 43, company_name: 'Acme Corp', location: 'Lyon, FR',
            type: 'document_check', status: 'completed', outcome: 'pass',
            feeUsd: 300, paymentConfirmedAt: '2026-05-10T00:00:00Z',
            createdAt: '2026-04-10T00:00:00Z', completedAt: '2026-05-09T00:00:00Z',
          },
        ],
      }),
    }),
  )

  // Admin disputes — empty by default
  await page.route('**/api/admin/disputes**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      }),
    }),
  )

}

module.exports = { seedSession, stubApi }
