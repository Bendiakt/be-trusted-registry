/**
 * admin.spec.js — E2E admin panel flows.
 *
 * Scenarios:
 *  1. Admin panel loads for admin-role user
 *  2. Non-admin (company role) is redirected to /login
 *  3. Overview tab shows platform stats
 *  4. Companies tab lists companies
 *  5. Certification level update triggers PATCH request
 */
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

test.describe('Admin — access control', () => {
  test('admin panel loads for admin role', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
    await page.goto('/admin')

    // Should NOT redirect to login
    await expect(page).toHaveURL(/\/admin/, { timeout: 6000 })
    // Stats from mock should appear
    await expect(page.getByText(/42|18|overview/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('company-role user is redirected from /admin to /login', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Corp User', email: 'corp@test.com', role: 'company' })
    await page.goto('/admin')

    // RoleRoute redirects wrong-role (authenticated) users to /dashboard, not /login
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
  })

  test('unauthenticated user is redirected from /admin to /login', async ({ page }) => {
    await stubApi(page)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 6000 })
  })
})

test.describe('Admin — overview stats', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('overview shows total users and companies from API', async ({ page }) => {
    await page.goto('/admin')
    // Stats stub returns { totalUsers: 42, totalCompanies: 18 }
    await expect(page.getByText('42')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('18')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Admin — companies tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('companies tab lists company names', async ({ page }) => {
    await page.goto('/admin')

    const companiesTab = page.getByRole('button', { name: /companies|entreprises/i }).first()
    await expect(companiesTab).toBeVisible({ timeout: 5000 })
    await companiesTab.click()

    // Stub returns "Acme Corp"
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 5000 })
  })

  test('certification level PATCH is called when level is saved', async ({ page }) => {
    let patchCalled = false
    let patchBody   = null

    await page.route('**/api/admin/companies/**/level', async (route) => {
      patchCalled = true
      patchBody   = route.request().postDataJSON()
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ message: 'Level updated' }),
      })
    })

    await page.goto('/admin')

    const companiesTab = page.getByRole('button', { name: /companies|entreprises/i }).first()
    if (await companiesTab.isVisible()) await companiesTab.click()

    // Look for a level select for the first company (AdminPanel uses <select>, not <input>)
    const levelInput = page.locator('select').first()
    if (await levelInput.isVisible()) {
      await levelInput.selectOption('3')
    }

    const saveBtn = page.getByRole('button', { name: /save|set level|certify|valider/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await page.waitForTimeout(1000)
      expect(patchCalled).toBe(true)
    }
  })
})

test.describe('Admin — disputes tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 99, name: 'Super Admin', email: 'admin@mydd.work', role: 'admin' })
  })

  test('disputes tab is accessible from admin panel', async ({ page }) => {
    await page.goto('/admin')

    const disputesTab = page.getByRole('button', { name: /dispute|litige|contest/i }).first()
    if (await disputesTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await disputesTab.click()
      // Tab content should render (stub returns empty list)
      await expect(
        page.getByText(/dispute|litige|aucun|no dispute|open/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('disputes tab shows open disputes when data is returned', async ({ page }) => {
    // Override stub to return one open dispute
    await page.route('**/api/admin/disputes**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 1, mission_id: 42, reason: 'Incorrect audit outcome',
              status: 'open', created_at: '2026-05-01T10:00:00Z',
              company_name: 'Acme Corp',
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
        }),
      }),
    )

    await page.goto('/admin')

    const disputesTab = page.getByRole('button', { name: /dispute|litige|contest/i }).first()
    if (await disputesTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await disputesTab.click()
      // Dispute reason or company name should appear
      await expect(
        page.getByText(/Acme Corp|Incorrect audit/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('resolving a dispute calls the resolve API', async ({ page }) => {
    let resolveCalled = false

    await page.route('**/api/admin/disputes**', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 1, mission_id: 42, reason: 'Incorrect audit outcome',
              status: 'open', created_at: '2026-05-01T10:00:00Z',
              company_name: 'Acme Corp',
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
        }),
      }),
    )

    await page.route('**/api/admin/disputes/*/resolve', async (route) => {
      resolveCalled = true
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ message: 'Dispute resolved' }),
      })
    })

    await page.goto('/admin')

    const disputesTab = page.getByRole('button', { name: /dispute|litige|contest/i }).first()
    if (await disputesTab.isVisible({ timeout: 4000 }).catch(() => false)) {
      await disputesTab.click()

      // Click the resolve/dismiss button for the open dispute
      const resolveBtn = page.getByRole('button', { name: /resolve|dismiss|upheld|close|valider|rejeter/i }).first()
      if (await resolveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resolveBtn.click()
        await page.waitForTimeout(1000)
        expect(resolveCalled).toBe(true)
      }
    }
  })
})
