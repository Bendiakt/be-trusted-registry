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

  // Registry (public)
  await page.route('**/api/registry**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR', certificationLevel: 2 },
          { id: 11, companyName: 'Beta Ltd',  sector: 'Logistics',     country: 'DE', certificationLevel: 1 },
        ],
        pagination: { page: 1, limit: 20, total: 2, pages: 1 },
      }),
    }),
  )

  // Verify
  await page.route('**/api/verify/**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 10, companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR',
        certInfo: {
          level: 2, status: 'active',
          grantedAt: '2025-01-01T00:00:00Z',
          expiresAt: '2026-01-01T00:00:00Z',
          daysLeft: 200, expiringSoon: false, expired: false,
        },
      }),
    }),
  )

  // Admin
  await page.route('**/api/admin/stats', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ totalUsers: 42, totalCompanies: 18, pendingMissions: 3, activeCompanies: 15 }),
    }),
  )
  await page.route('**/api/admin/companies**', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 10, companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR', certificationLevel: 2, status: 'active' },
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

  // Catch-all: let any unmatched /api/ request return a generic 404
  // so tests don't hang waiting for a real server.
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not mocked' }) }),
  )
}

module.exports = { seedSession, stubApi }
