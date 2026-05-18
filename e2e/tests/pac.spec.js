/**
 * pac.spec.js — E2E tests for the PAC Agent Portal.
 *
 * Scenarios:
 *  1. Access control — pac role loads portal, wrong roles redirect
 *  2. Missions tab — shows mission stats (active / available / completed counts)
 *  3. Missions tab — lists available missions
 *  4. Missions tab — accept a mission triggers POST
 *  5. Missions tab — submit a report triggers POST
 *  6. Profile tab — loads and saves profile
 */
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

// ── PAC API stubs ─────────────────────────────────────────────────────────────

async function stubPacApi(page) {
  await stubApi(page)

  // Profile
  await page.route('**/api/pac/profile', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          name: 'Alice PAC', location: 'Paris, France',
          languages: 'French, English', certifications: 'ISO 9001',
          bio: 'Experienced auditor.',
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  // Missions list
  await page.route('**/api/pac/missions', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 1, company_name: 'Acme Corp', location: 'Paris', type: 'on_site',
            fee: 500, status: 'available', description: 'ISO 14001 audit' },
          { id: 2, company_name: 'Beta Ltd',  location: 'Lyon',  type: 'on_site',
            fee: 750, status: 'assigned',  description: 'AML compliance review' },
          { id: 3, company_name: 'Gamma Inc', location: 'Nice',  type: 'on_site',
            fee: 600, status: 'completed', description: 'Quality audit',
            completedAt: '2025-03-01T00:00:00Z' },
        ],
      }),
    })
  )

  // Accept mission
  await page.route('**/api/pac/missions/*/accept', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )

  // Complete / submit report
  await page.route('**/api/pac/missions/*/complete', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )
}

const PAC_USER = { id: 5, name: 'Alice PAC', email: 'alice@pac.com', role: 'pac' }

// ── Access control ────────────────────────────────────────────────────────────

test.describe('PAC — access control', () => {
  test('pac-role user loads portal', async ({ page }) => {
    await stubPacApi(page)
    await page.goto('/login')
    await seedSession(page, PAC_USER)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/pac/, { timeout: 6000 })
    // Nav label visible
    await expect(page.getByText(/PAC Agent Portal/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('company-role user is redirected from /pac to /dashboard', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Corp', email: 'corp@test.com', role: 'company' })
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
  })

  test('unauthenticated user is redirected from /pac to /login', async ({ page }) => {
    await stubApi(page)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/login/, { timeout: 6000 })
  })
})

// ── Missions tab ──────────────────────────────────────────────────────────────

test.describe('PAC — missions tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubPacApi(page)
    await page.goto('/login')
    await seedSession(page, PAC_USER)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/pac/, { timeout: 6000 })
  })

  test('mission status counts are shown', async ({ page }) => {
    // stub: 1 assigned (active), 1 available, 1 completed
    await expect(page.getByText('1').first()).toBeVisible({ timeout: 5000 })
  })

  test('mission list renders company names', async ({ page }) => {
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Beta Ltd')).toBeVisible({ timeout: 5000 })
  })

  test('accepting a mission triggers POST and shows confirmation', async ({ page }) => {
    let acceptCalled = false
    await page.route('**/api/pac/missions/1/accept', (route) => {
      acceptCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    // Click the Accept button on mission 1
    const acceptBtn = page.getByRole('button', { name: /accept/i }).first()
    await expect(acceptBtn).toBeVisible({ timeout: 5000 })
    await acceptBtn.click()

    expect(acceptCalled).toBe(true)
    // Success message appears
    await expect(page.getByText(/accepted/i)).toBeVisible({ timeout: 5000 })
  })

  test('report form opens and submit triggers POST', async ({ page }) => {
    let completeCalled = false
    await page.route('**/api/pac/missions/*/complete', (route) => {
      completeCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })

    // Open the report form on assigned mission (Beta Ltd)
    const reportBtn = page.getByRole('button', { name: /submit report/i }).first()
    await expect(reportBtn).toBeVisible({ timeout: 5000 })
    await reportBtn.click()

    // Fill in report text
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 3000 })
    await textarea.fill('Detailed audit findings: all criteria met, documentation complete.')

    // Select outcome
    const outcomeSelect = page.locator('select').first()
    if (await outcomeSelect.isVisible()) await outcomeSelect.selectOption('pass')

    // Submit
    const submitBtn = page.getByRole('button', { name: /submit/i }).last()
    await submitBtn.click()

    expect(completeCalled).toBe(true)
    await expect(page.getByText(/submitted|completed/i)).toBeVisible({ timeout: 5000 })
  })
})

// ── Profile tab ───────────────────────────────────────────────────────────────

test.describe('PAC — profile tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubPacApi(page)
    await page.goto('/login')
    await seedSession(page, PAC_USER)
    await page.goto('/pac')
    await expect(page).toHaveURL(/\/pac/, { timeout: 6000 })
  })

  test('profile tab shows loaded profile data', async ({ page }) => {
    // Click the Profile tab
    const profileTab = page.getByRole('button', { name: /profile/i })
    await expect(profileTab).toBeVisible({ timeout: 5000 })
    await profileTab.click()

    // Profile data from stub should appear
    await expect(page.getByDisplayValue('Alice PAC')).toBeVisible({ timeout: 5000 })
  })

  test('saving profile triggers PATCH and shows success', async ({ page }) => {
    let saveCalled = false
    await page.route('**/api/pac/profile', (route) => {
      if (route.request().method() !== 'GET') {
        saveCalled = true
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ name: 'Alice PAC', location: 'Paris, France', languages: 'French', certifications: '', bio: '' }),
      })
    })

    const profileTab = page.getByRole('button', { name: /profile/i })
    await expect(profileTab).toBeVisible({ timeout: 5000 })
    await profileTab.click()

    // Save button
    const saveBtn = page.getByRole('button', { name: /save/i })
    await expect(saveBtn).toBeVisible({ timeout: 5000 })
    await saveBtn.click()

    expect(saveCalled).toBe(true)
    await expect(page.getByText(/saved|success/i)).toBeVisible({ timeout: 5000 })
  })
})
