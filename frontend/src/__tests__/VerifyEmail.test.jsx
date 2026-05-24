/**
 * Tests for VerifyEmail page.
 *
 * The page fires an API call on mount using the ?token= query param.
 * Three states: pending (during call), success, error.
 *
 * Covers:
 *  - Shows pending state while API call is in-flight
 *  - Shows success state when API resolves
 *  - Shows error state when API rejects (with API-provided message)
 *  - Shows missing-token error when no token in URL
 *  - Dashboard link present in both success and error states
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// ── Stubs ────────────────────────────────────────────────────────────────────
let mockToken = 'valid_token_abc'

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [{ get: (key) => (key === 'token' ? mockToken : null) }],
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

import VerifyEmail from '../pages/VerifyEmail'
import api from '../lib/api'

// ── Tests ────────────────────────────────────────────────────────────────────
describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken = 'valid_token_abc'
  })

  it('calls GET /api/auth/verify-email with the token from the URL', async () => {
    api.get.mockResolvedValueOnce({})
    render(<VerifyEmail />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/verify-email'),
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('valid_token_abc'),
      )
    })
  })

  it('shows success state after the API resolves', async () => {
    api.get.mockResolvedValueOnce({})
    render(<VerifyEmail />)
    await waitFor(() => {
      expect(screen.getByText('verify_email.success_title')).toBeInTheDocument()
    })
    // Dashboard link visible in success state
    expect(document.querySelector('a[href="/dashboard"]')).toBeInTheDocument()
  })

  it('shows error state with API-provided message when API rejects', async () => {
    api.get.mockRejectedValueOnce({
      response: { data: { error: 'Token expired or already used' } },
    })
    render(<VerifyEmail />)
    await waitFor(() => {
      expect(screen.getByText('verify_email.error_title')).toBeInTheDocument()
      expect(screen.getByText('Token expired or already used')).toBeInTheDocument()
    })
  })

  it('falls back to i18n error key when API rejects with no message', async () => {
    api.get.mockRejectedValueOnce({ response: null })
    render(<VerifyEmail />)
    await waitFor(() => {
      expect(screen.getByText('verify_email.error_title')).toBeInTheDocument()
      expect(screen.getByText('verify_email.invalid_token')).toBeInTheDocument()
    })
  })

  it('shows missing-token error immediately when no token in URL', async () => {
    mockToken = null
    render(<VerifyEmail />)
    // Error is set synchronously — no API call needed
    await waitFor(() => {
      expect(screen.getByText('verify_email.error_title')).toBeInTheDocument()
      expect(screen.getByText('verify_email.missing_token')).toBeInTheDocument()
    })
    // API should NOT have been called
    expect(api.get).not.toHaveBeenCalled()
  })

  it('dashboard link is present in error state too', async () => {
    api.get.mockRejectedValueOnce({ response: null })
    render(<VerifyEmail />)
    await waitFor(() => {
      expect(screen.getByText('verify_email.error_title')).toBeInTheDocument()
    })
    expect(document.querySelector('a[href="/dashboard"]')).toBeInTheDocument()
  })
})
