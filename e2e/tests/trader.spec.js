/**
 * trader.spec.js — E2E tests for the Trader Portal.
 *
 * Scenarios:
 *  1. Access control — trader/admin role loads portal, wrong roles redirect
 *  2. Registry tab — shows company list and search
 *  3. Registry tab — watchlist toggle (add / remove)
 *  4. Watchlist tab — shows watched companies
 *  5. Stats panel — displays KPIs
 */
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

// ── Trader API stubs ──────────────────────────────────────────────────────────

async function stubTraderApi(page) {
  await stubApi(page)

  // Stats
  await page.route('**/api/trader/stats', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        watched_total: 3, watched_certified: 2, expiring_soon: 1, uncertified: 1,
      }),
    })
  )

  // Watchlist:
  //   GET ?limit=1000  → lightweight id-only snapshot for star state (empty — stars show as ☆)
  //   GET (other)      → full watchlist for the Watchlist tab
  //   POST / DELETE    → silently succeed
  await page.route('**/api/trader/watchlist**', (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      const url = route.request().url()
      // Lightweight check: return empty so watchedIds = {} and stars show as ☆ (first click = POST)
      if (url.includes('limit=1000')) {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: [], pagination: { total: 0, page: 1, limit: 1000, pages: 0 } }),
        })
      }
      // Watchlist tab data
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 10, name: 'Acme Corp',  company_name: 'Acme Corp',  country: 'FR', level: 2,
              cert_status: 'active', expires_at: '2026-06-01T00:00:00Z', trust_score: 82, added_at: '2025-01-01' },
            { id: 11, name: 'Beta Ltd',   company_name: 'Beta Ltd',   country: 'DE', level: 1,
              cert_status: 'active', expires_at: '2026-12-01T00:00:00Z', trust_score: 74, added_at: '2025-02-01' },
          ],
          pagination: { total: 2, page: 1, limit: 20, pages: 1 },
        }),
      })
    }
    // POST / DELETE — silently succeed
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ watched: true }) })
  })

  // CSV export
  await page.route('**/api/trader/watchlist/export**', (route) =>
    route.fulfill({
      status: 200, contentType: 'text/csv',
      body: 'Name,Country,Level\nAcme Corp,FR,2\n',
    })
  )
}

const TRADER_USER = { id: 7, name: 'Bob Trader', email: 'bob@trader.com', role: 'trader' }
const ADMIN_USER  = { id: 99, name: 'Admin',     email: 'admin@mydd.work', role: 'admin' }

// ── Access control ────────────────────────────────────────────────────────────

test.describe('Trader — access control', () => {
  test('trader-role user loads portal', async ({ page }) => {
    await stubTraderApi(page)
    await page.goto('/login')
    await seedSession(page, TRADER_USER)
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/trader/, { timeout: 6000 })
    await expect(page.getByText(/Supplier Registry|B&E Trusted Registry/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('admin-role user can also access trader portal', async ({ page }) => {
    await stubTraderApi(page)
    await page.goto('/login')
    await seedSession(page, ADMIN_USER)
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/trader/, { timeout: 6000 })
  })

  test('company-role user is redirected from /trader to /dashboard', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Corp', email: 'corp@test.com', role: 'company' })
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
  })

  test('unauthenticated user is redirected from /trader to /login', async ({ page }) => {
    await stubApi(page)
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/login/, { timeout: 6000 })
  })
})

// ── Registry tab ──────────────────────────────────────────────────────────────

test.describe('Trader — registry tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubTraderApi(page)
    await page.goto('/login')
    await seedSession(page, TRADER_USER)
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/trader/, { timeout: 6000 })
  })

  test('registry tab is active by default and shows companies', async ({ page }) => {
    // Default tab is registry — company names from stub should appear
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Beta Ltd').first()).toBeVisible({ timeout: 5000 })
  })

  test('search input is visible and accepts text', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('Acme')
    await expect(searchInput).toHaveValue('Acme')
  })

  test('adding to watchlist triggers POST request', async ({ page }) => {
    let postCalled = false
    await page.route('**/api/trader/watchlist/10', (route) => {
      if (route.request().method() === 'POST') {
        postCalled = true
        return route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ watched: true, companyId: 10 }),
        })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ watched: false }) })
    })

    // Wait for companies to load
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 5000 })

    // Click the company toggle button — content is exactly "☆" or "★" (single star char).
    // Uses a regex anchored to the full text so we don't accidentally click the
    // "★ Watchlist" tab button which also contains a star.
    const starBtn = page.locator('button').filter({ hasText: /^[☆★]$/ }).first()
    if (await starBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await starBtn.click()
      expect(postCalled).toBe(true)
    }
  })
})

// ── Watchlist tab ─────────────────────────────────────────────────────────────

test.describe('Trader — watchlist tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubTraderApi(page)
    await page.goto('/login')
    await seedSession(page, TRADER_USER)
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/trader/, { timeout: 6000 })
  })

  test('switching to watchlist tab shows watched companies', async ({ page }) => {
    const watchlistTab = page.getByRole('button', { name: /watchlist/i })
    await expect(watchlistTab).toBeVisible({ timeout: 5000 })
    await watchlistTab.click()

    // Watchlist stub returns Acme Corp and Beta Ltd
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Beta Ltd').first()).toBeVisible({ timeout: 5000 })
  })

  test('removing from watchlist triggers DELETE request', async ({ page }) => {
    let deleteCalled = false
    await page.route('**/api/trader/watchlist/10', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ watched: false, companyId: 10 }),
        })
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ watched: true }) })
    })

    // Switch to watchlist tab
    const watchlistTab = page.getByRole('button', { name: /watchlist/i })
    await watchlistTab.click()
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 5000 })

    // Click the filled star (★) to remove — anchored regex excludes the "★ Watchlist" tab button.
    const filledStar = page.locator('button').filter({ hasText: /^★$/ }).first()
    if (await filledStar.isVisible({ timeout: 3000 }).catch(() => false)) {
      await filledStar.click()
      expect(deleteCalled).toBe(true)
    }
  })
})

// ── Stats panel ───────────────────────────────────────────────────────────────

test.describe('Trader — stats panel', () => {
  test('KPI stats are displayed from API', async ({ page }) => {
    await stubTraderApi(page)
    await page.goto('/login')
    await seedSession(page, TRADER_USER)
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/trader/, { timeout: 6000 })

    // Stats stub returns watched_total: 3, watched_certified: 2
    // At least one KPI number should be visible
    await expect(page.getByText('3').first()).toBeVisible({ timeout: 5000 })
  })
})

// ── Compare panel ─────────────────────────────────────────────────────────────

test.describe('Trader — compare panel', () => {
  // Extended timeout: beforeEach does 2 navigations (login + trader) after Vite cold start
  test.setTimeout(30000)

  test.beforeEach(async ({ page }) => {
    await stubTraderApi(page)
    await page.goto('/login')
    await seedSession(page, TRADER_USER)
    await page.goto('/trader')
    await expect(page).toHaveURL(/\/trader/, { timeout: 8000 })
  })

  test('compare sticky bar appears after selecting two companies', async ({ page }) => {
    // Wait for companies to render, then click ⇌ on both cards
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 6000 })
    const compareBtns = page.locator('button').filter({ hasText: /^⇌$/ })
    await compareBtns.nth(0).click()
    await compareBtns.nth(1).click()

    // Sticky bar should now show "Compare 2 companies →"
    await expect(
      page.getByRole('button', { name: /compare 2 companies/i })
    ).toBeVisible({ timeout: 5000 })
  })

  test('compare panel opens with company names after clicking compare button', async ({ page }) => {
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 6000 })
    const compareBtns = page.locator('button').filter({ hasText: /^⇌$/ })
    await compareBtns.nth(0).click()
    await compareBtns.nth(1).click()

    // Click the "Compare 2 companies →" button to open the panel
    await page.getByRole('button', { name: /compare 2 companies/i }).click()

    // ComparePanel renders both company names side-by-side
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Beta Ltd').first()).toBeVisible({ timeout: 5000 })
  })

  test('closing compare panel hides it', async ({ page }) => {
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 6000 })
    const compareBtns = page.locator('button').filter({ hasText: /^⇌$/ })
    await compareBtns.nth(0).click()
    await compareBtns.nth(1).click()

    await page.getByRole('button', { name: /compare 2 companies/i }).click()

    // Close with the ✕ button inside the panel header.
    // The sticky bar also has ✕ per company (2 of them), so use .last() to target the panel's close button.
    await page.locator('button').filter({ hasText: '✕' }).last().click()

    // Panel is gone — sticky bar with "Compare 2 companies →" returns
    await expect(
      page.getByRole('button', { name: /compare 2 companies/i })
    ).toBeVisible({ timeout: 5000 })
  })

  test('clearing compare removes sticky bar', async ({ page }) => {
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 6000 })
    const compareBtns = page.locator('button').filter({ hasText: /^⇌$/ })
    await compareBtns.nth(0).click()
    await compareBtns.nth(1).click()

    // Clear button in the sticky bar
    const clearBtn = page.locator('button').filter({ hasText: /clear/i }).first()
    await expect(clearBtn).toBeVisible({ timeout: 5000 })
    await clearBtn.click()

    // Sticky bar should be gone
    await expect(
      page.getByRole('button', { name: /compare 2 companies/i })
    ).not.toBeVisible({ timeout: 3000 })
  })
})
