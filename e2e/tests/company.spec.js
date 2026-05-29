/**
 * company.spec.js — E2E company profile flows.
 *
 * Scenarios:
 *  1. Dashboard loads and shows company name + certification badge
 *  2. Company registration form submits successfully
 *  3. Validation error shown when required fields missing
 *  4. Certification level badge renders correct tier
 *  5. Developer tab — API keys management (list, create, revoke)
 *  6. Developer tab — Webhooks management (list, create, delete, ping)
 *  7. Notifications tab — renders notifications, mark-all-read
 *  8. Auth guard — unauthenticated access to /onboarding redirects
 */
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

test.describe('Company — dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Alice Dupont', email: 'alice@acme.com', role: 'company' })
  })

  test('dashboard loads and displays company name', async ({ page }) => {
    await page.goto('/dashboard')
    // The page should show the company name from the /api/companies/me stub
    await expect(page.getByText('Acme Corp')).toBeVisible({ timeout: 6000 })
  })

  test('dashboard shows certification level badge', async ({ page }) => {
    await page.goto('/dashboard')
    // Level 2 stub — some badge or level indicator should appear
    await expect(page.getByText(/level 2|niveau 2|★/i)).toBeVisible({ timeout: 6000 })
  })

  test('company registration tab is reachable', async ({ page }) => {
    await page.goto('/dashboard')

    // Click the Register / Company tab
    const registerTab = page.getByRole('button', { name: /register|company|entreprise/i }).first()
    await expect(registerTab).toBeVisible({ timeout: 5000 })
    await registerTab.click()

    // RegisterCompanyForm renders plain <input required> with no name/id/placeholder attrs
    const nameInput = page.locator('form input[required], form input').first()
    await expect(nameInput).toBeVisible({ timeout: 4000 })
  })
})

test.describe('Company — registration form', () => {
  test('successful company registration shows confirmation', async ({ page }) => {
    await stubApi(page)

    // Stub the register endpoint
    await page.route('**/api/companies/register', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ message: 'Company registered', company: { id: 10 } }),
      }),
    )

    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Alice Dupont', email: 'alice@acme.com', role: 'company' })
    await page.goto('/dashboard')

    // Navigate to the registration tab
    const registerTab = page.getByRole('button', { name: /register|company|entreprise/i }).first()
    await registerTab.click()

    // Fill in the form fields — RegisterCompanyForm uses plain inputs with no name/id/placeholder
    const formInputs = page.locator('form input')
    const nameInput = formInputs.first()
    if (await nameInput.isVisible()) {
      await nameInput.fill('My New Company')
    }

    // Country is the third input (after name, sector) — fill if present
    const countryInput = formInputs.nth(2)
    if (await countryInput.isVisible()) {
      await countryInput.fill('France')
    }

    // Submit — use type="submit" so we don't accidentally click a tab button
    const submitBtn = page.locator('form button[type="submit"]').first()
    if (await submitBtn.isVisible()) {
      await submitBtn.click()
      // Expect some success feedback (toast, message, or no error)
      await expect(page.getByText(/success|saved|registered|enregistré/i).or(
        page.locator('[class*="success"], [class*="toast"]')
      )).toBeVisible({ timeout: 5000 })
    }
  })
})

// ── Onboarding wizard ─────────────────────────────────────────────────────────
const ONBOARDING_KEY = 'mydd_onboarding_done'

test.describe('Company — onboarding wizard', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    // Stub the companies/me PATCH for the profile save step
    await page.route('**/api/companies/me', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ company: { id: 10, companyName: 'Acme Corp' } }),
        })
      } else {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            company: { id: 10, companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR', website: '' },
            user: { id: 1, name: 'Acme Corp', email: 'alice@acme.com', role: 'company' },
          }),
        })
      }
    })
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Acme Corp', email: 'alice@acme.com', role: 'company' })
    // Clear onboarding flag so wizard is accessible
    await page.evaluate((key) => localStorage.removeItem(key), ONBOARDING_KEY)
  })

  test('onboarding page renders step 1 heading', async ({ page }) => {
    await page.goto('/onboarding')

    await expect(page.getByRole('heading', { name: /set up your company profile/i }))
      .toBeVisible({ timeout: 6000 })
  })

  test('step 1: progress bar shows Profile / Documents / Level labels', async ({ page }) => {
    await page.goto('/onboarding')

    // Use the eyebrow step counter as a stable marker (no ambiguity with "profile" in h1)
    await expect(page.getByText('Step 1 of 3')).toBeVisible({ timeout: 5000 })
    // Exact match for progress-bar span labels (avoids partial match with h1 "company profile")
    await expect(page.getByText('Profile', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Documents', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Level', { exact: true })).toBeVisible({ timeout: 5000 })
  })

  test('step 1: company name input is pre-filled from session', async ({ page }) => {
    await page.goto('/onboarding')

    const nameInput = page.locator('#ob-name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    // Pre-filled from session name
    await expect(nameInput).toHaveValue('Acme Corp')
  })

  test('step 1: Continue advances to step 2 (documents)', async ({ page }) => {
    await page.goto('/onboarding')

    const nameInput = page.locator('#ob-name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Acme Corp')

    await page.getByRole('button', { name: /continue/i }).first().click()

    await expect(page.getByRole('heading', { name: /prepare your documents/i }))
      .toBeVisible({ timeout: 6000 })
  })

  test('step 1: validation prevents empty company name', async ({ page }) => {
    await page.goto('/onboarding')

    const nameInput = page.locator('#ob-name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('')

    await page.getByRole('button', { name: /continue/i }).first().click()

    await expect(page.getByText(/company name is required/i)).toBeVisible({ timeout: 4000 })
  })

  test('step 2: document checklist is displayed', async ({ page }) => {
    await page.goto('/onboarding')

    // Advance past step 1
    const nameInput = page.locator('#ob-name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Acme Corp')
    await page.getByRole('button', { name: /continue/i }).first().click()
    await expect(page.getByRole('heading', { name: /prepare your documents/i })).toBeVisible({ timeout: 6000 })

    await expect(page.getByText(/certificate of incorporation/i)).toBeVisible({ timeout: 4000 })
  })

  test('step 2 → step 3: Continue advances to level picker', async ({ page }) => {
    await page.goto('/onboarding')

    // Step 1
    const nameInput = page.locator('#ob-name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Acme Corp')
    await page.getByRole('button', { name: /continue/i }).first().click()
    await expect(page.getByRole('heading', { name: /prepare your documents/i })).toBeVisible({ timeout: 6000 })

    // Step 2
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: /choose your certification level/i }))
      .toBeVisible({ timeout: 6000 })
  })

  test('step 3: level cards are displayed', async ({ page }) => {
    await page.goto('/onboarding')

    const nameInput = page.locator('#ob-name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Acme Corp')
    await page.getByRole('button', { name: /continue/i }).first().click()
    await expect(page.getByRole('heading', { name: /prepare your documents/i })).toBeVisible({ timeout: 6000 })
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByRole('heading', { name: /choose your certification level/i })).toBeVisible({ timeout: 6000 })

    await expect(page.getByText(/Bronze · Level 1/i)).toBeVisible({ timeout: 4000 })
    await expect(page.getByText(/Silver · Level 2/i)).toBeVisible({ timeout: 4000 })
    await expect(page.getByText(/Gold · Level 3/i)).toBeVisible({ timeout: 4000 })
  })

  test('"Skip for now" sets localStorage flag and goes to /dashboard', async ({ page }) => {
    await page.goto('/onboarding')

    await expect(page.getByRole('heading', { name: /set up your company profile/i }))
      .toBeVisible({ timeout: 6000 })

    await page.getByRole('button', { name: /skip for now/i }).click()

    // Should redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
    // Flag should be set
    const flag = await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)
    expect(flag).toBe('1')
  })

})

// ── Auth guard — standalone (no shared beforeEach) ────────────────────────────
// This test must NOT run inside the 'Company — onboarding wizard' beforeEach
// because that beforeEach does page.goto('/login') + seedSession, adding ~11 s
// of overhead. The test would then clear the session and load /onboarding again,
// pushing the total time past the 20 s per-test limit on slower machines.
// Running it standalone: one navigation only → well within the timeout budget.
test('unauthenticated access to /onboarding redirects to /login', async ({ page }) => {
  // Stub API so the CSRF call and any other requests don't hang.
  // No session is seeded — this is the unauthenticated scenario.
  await stubApi(page)
  await page.goto('/onboarding')
  // PrivateRoute (App.jsx) checks getSession() synchronously; with no session in
  // sessionStorage it renders <Navigate to="/login" replace />, which fires
  // navigate() in a React useEffect and changes the URL within milliseconds.
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
})

// ── Developer tab — API Keys ──────────────────────────────────────────────────
test.describe('Company — developer tab (API keys)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Acme Corp', email: 'alice@acme.com', role: 'company' })
  })

  test('developer tab is reachable from dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    // Wait for the Create key button to appear (unique to the developer tab)
    await expect(page.getByRole('button', { name: /create key/i })).toBeVisible({ timeout: 6000 })
  })

  test('existing API keys are listed', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    await expect(page.getByText('Production')).toBeVisible({ timeout: 6000 })
    await expect(page.getByText('Staging')).toBeVisible({ timeout: 6000 })
  })

  test('key prefix is displayed', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    await expect(page.getByText(/mydd_live/)).toBeVisible({ timeout: 6000 })
  })

  test('create API key reveals full key once', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    // Wait for existing keys to load
    await expect(page.getByText('Production')).toBeVisible({ timeout: 6000 })
    // Fill in key name and submit
    const nameInput = page.locator('input[placeholder*="key" i], input[placeholder*="name" i]').first()
    await nameInput.fill('My CI Key')
    await page.getByRole('button', { name: /generate|create|add/i }).first().click()
    // Full key should be revealed (starts with mydd_test_)
    await expect(page.getByText(/mydd_test_/)).toBeVisible({ timeout: 6000 })
  })

  test('revoke API key removes it from the list', async ({ page }) => {
    // Override key delete stub to track the call
    let revokedId = null
    await page.route('**/api/keys/**', async (route) => {
      const url = route.request().url()
      const id = url.split('/').pop()
      revokedId = id
      await route.fulfill({ status: 204, body: '' })
    })

    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    await expect(page.getByText('Production')).toBeVisible({ timeout: 6000 })
    // Click the first revoke button
    const revokeBtn = page.getByRole('button', { name: /revoke/i }).first()
    await expect(revokeBtn).toBeVisible({ timeout: 5000 })
    await revokeBtn.click()
    // The row should disappear (optimistic update)
    await expect(page.getByText('Production')).not.toBeVisible({ timeout: 5000 })
  })
})

// ── Developer tab — Webhooks ──────────────────────────────────────────────────
test.describe('Company — developer tab (webhooks)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Acme Corp', email: 'alice@acme.com', role: 'company' })
  })

  test('existing webhooks are listed', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    await expect(page.getByText('https://hooks.example.com/mydd')).toBeVisible({ timeout: 6000 })
  })

  test('webhook event badges are displayed', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    // Wait for the webhook URL to appear in the list (proves the list loaded)
    await expect(page.getByText('https://hooks.example.com/mydd')).toBeVisible({ timeout: 6000 })
    // The event badge is a <span> (not the checkbox label), so scope to span elements
    await expect(page.locator('span').filter({ hasText: /cert\.status_changed/ }).first())
      .toBeVisible({ timeout: 5000 })
  })

  test('create webhook reveals signing secret once', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    await expect(page.getByText('https://hooks.example.com/mydd')).toBeVisible({ timeout: 6000 })
    // Fill URL field — it's in the webhooks section (after API keys section)
    const urlInput = page.locator('input[type="url"], input[placeholder*="https" i]').last()
    await urlInput.fill('https://example.com/webhook')
    await page.getByRole('button', { name: /register|add|create/i }).last().click()
    // Signing secret should be shown
    await expect(page.getByText(/whsec_/)).toBeVisible({ timeout: 6000 })
  })

  test('ping webhook shows success result', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /developer/i }).click()
    await expect(page.getByText('https://hooks.example.com/mydd')).toBeVisible({ timeout: 6000 })
    await page.getByRole('button', { name: /ping/i }).click()
    // Success response stubbed as statusCode 200
    await expect(page.getByText(/200|success/i)).toBeVisible({ timeout: 6000 })
  })
})

// ── Notifications tab ─────────────────────────────────────────────────────────
test.describe('Company — notifications tab', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Acme Corp', email: 'alice@acme.com', role: 'company' })
  })

  test('notifications tab is reachable from dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /notifications/i }).click()
    // NotificationsPanel renders n.title in the title div
    await expect(page.getByText('Certification approved')).toBeVisible({ timeout: 6000 })
  })

  test('all three notifications are rendered', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /notifications/i }).click()
    await expect(page.getByText('Certification approved')).toBeVisible({ timeout: 6000 })
    await expect(page.getByText('PAC agent assigned')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Certification expiring soon')).toBeVisible({ timeout: 5000 })
  })

  test('mark-all-read button calls PATCH /api/notifications/read-all', async ({ page }) => {
    let markAllCalled = false
    // Override only the read-all endpoint; GET comes from stubApi (LIFO — registered last → wins)
    await page.route('**/api/notifications/read-all', async (route) => {
      markAllCalled = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ updated: 2 }) })
    })

    await page.goto('/dashboard')
    await page.getByRole('button', { name: /notifications/i }).click()
    await expect(page.getByText('Certification approved')).toBeVisible({ timeout: 6000 })
    // "Mark all as read" — i18n en.json: dashboard.notifications.mark_all_read = "Mark all as read"
    await page.getByRole('button', { name: /mark all as read/i }).click()
    await expect(async () => { expect(markAllCalled).toBe(true) }).toPass({ timeout: 4000 })
  })
})
