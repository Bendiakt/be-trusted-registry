// @ts-check
const { defineConfig, devices } = require('@playwright/test')

/**
 * Playwright config for MyDD E2E tests.
 *
 * Strategy: the frontend Vite dev server is started automatically
 * (webServer block below). All /api/* calls are intercepted via
 * page.route() in each test — no live backend or database required.
 *
 * To run locally: cd e2e && npx playwright test
 * To run in CI:   npx playwright test --reporter=github
 */
module.exports = defineConfig({
  testDir: './tests',
  timeout:  20_000,      // per-test timeout
  retries:  process.env.CI ? 1 : 0,
  workers:  process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'],   ['html', { open: 'on-failure' }]],

  use: {
    baseURL:           'http://localhost:5174',
    // Inject CSRF cookie before each test so the CSRF middleware is happy
    // (tests run against a real Vite dev server; the backend is fully mocked).
    extraHTTPHeaders:  {},
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    trace:             'retain-on-failure',
  },

  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Vite dev server once for all tests.
  // reuseExistingServer avoids a second start when running locally.
  webServer: {
    command:            'npm run dev -- --port 5174',
    cwd:                '../frontend',
    url:                'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout:            60_000,
    env: {
      // No backend needed — API calls are mocked via page.route()
      VITE_API_URL: '',
    },
  },
})
