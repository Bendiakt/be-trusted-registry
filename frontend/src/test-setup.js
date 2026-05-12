// Vitest global setup — runs before every test file.
// jsdom is already configured as the environment in vite.config.js.
// Add any global mocks / polyfills here.

// Extend Vitest's expect with jest-dom matchers (toBeInTheDocument, etc.)
import '@testing-library/jest-dom'

// Silence expected console.error calls in tests (e.g. React prop warnings).
// Individual tests can override this if they need to assert on console output.
import { vi } from 'vitest'

// Make sessionStorage available and reset between tests (jsdom resets automatically
// per test file but not per test — afterEach below handles that).
afterEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
})
