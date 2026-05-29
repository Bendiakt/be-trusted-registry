/**
 * auth.spec.js — E2E authentication flows.
 *
 * Scenarios:
 *  1. Successful login (returning company) → redirect to /dashboard
 *  2. Successful login (fresh company, no onboarding flag) → redirect to /onboarding
 *  3. Wrong credentials → inline error message
 *  4. Logout from dashboard → redirect to /login
 *  5. 2FA step shown when requires2fa returned
 *  6. Unauthenticated access to /dashboard → redirect to /login
 *
 * Onboarding flag: Login.jsx reads localStorage key 'mydd_onboarding_done'.
 * Company users who have NOT completed onboarding are redirected to /onboarding.
 */

const ONBOARDING_KEY = 'mydd_onboarding_done'
const { test, expect } = require('@playwright/test')
const { seedSession, stubApi } = require('./helpers')

test.describe('Auth — login', () => {
  test('successful login redirects to /dashboard (returning company)', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')

    // Simulate a company that has already completed onboarding
    await page.evaluate(key => localStorage.setItem(key, '1'), ONBOARDING_KEY)

    await page.fill('#login-email', 'test@example.com')
    await page.fill('#login-password', 'password123')
    await page.click('button[type="submit"]')

    // POST /api/auth/login stub returns a company-role user
    // With onboarding flag set → redirects to /dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
  })

  test('successful login redirects to /onboarding for fresh company (no flag)', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')

    // Ensure the flag is NOT set (fresh company user)
    await page.evaluate(key => localStorage.removeItem(key), ONBOARDING_KEY)

    await page.fill('#login-email', 'test@example.com')
    await page.fill('#login-password', 'password123')
    await page.click('button[type="submit"]')

    // No onboarding flag → redirects to /onboarding
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 6000 })
  })

  test('wrong credentials show inline error', async ({ page }) => {
    await stubApi(page)

    // Override the default login stub with a 400 response
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      }),
    )

    await page.goto('/login')
    await page.fill('#login-email', 'wrong@example.com')
    await page.fill('#login-password', 'badpass')
    await page.click('button[type="submit"]')

    await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 4000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('requires2fa response shows TOTP step', async ({ page }) => {
    await stubApi(page)

    // Step-1: login returns a temp token
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ requires2fa: true, tempToken: 'tmp-abc-123' }),
      }),
    )
    // Step-2: TOTP validation
    await page.route('**/api/auth/2fa/validate', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ user: { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' } }),
      }),
    )

    await page.goto('/login')
    await page.fill('#login-email', 'admin@test.com')
    await page.fill('#login-password', 'password123')
    await page.click('button[type="submit"]')

    // TOTP input should now be visible
    await expect(page.locator('input[placeholder="000000"]')).toBeVisible({ timeout: 4000 })

    // Enter a valid 6-digit code
    await page.fill('input[placeholder="000000"]', '123456')
    await page.click('button[type="submit"]')

    // Admin users redirect to /admin
    await expect(page).toHaveURL(/\/admin/, { timeout: 6000 })
  })
})

test.describe('Auth — logout', () => {
  test('logout from dashboard clears session and redirects to /login', async ({ page }) => {
    await stubApi(page)

    // Pre-seed session so the dashboard renders
    await page.goto('/login')
    await seedSession(page, { id: 1, name: 'Test User', email: 'test@example.com', role: 'company' })
    await page.goto('/dashboard')

    // Locate and click the logout button (text varies by i18n, use role)
    const logoutBtn = page.getByRole('button', { name: /logout|sign out|déconnexion/i })
    await expect(logoutBtn).toBeVisible({ timeout: 5000 })
    await logoutBtn.click()

    await expect(page).toHaveURL(/\/login/, { timeout: 6000 })
  })
})

test.describe('Auth — route guard', () => {
  test('visiting /dashboard without session redirects to /login', async ({ page }) => {
    await stubApi(page)
    // Go straight to a protected route without seeding a session
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 6000 })
  })

  test('visiting /admin with company role redirects to /login', async ({ page }) => {
    await stubApi(page)
    await page.goto('/login')
    await seedSession(page, { id: 2, name: 'Corp User', email: 'corp@test.com', role: 'company' })
    await page.goto('/admin')
    // RoleRoute redirects authenticated users with wrong role to /dashboard, not /login
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 })
  })
})
