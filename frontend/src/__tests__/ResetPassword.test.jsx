/**
 * Tests for ResetPassword page.
 *
 * Covers:
 *  - Renders new-password and confirm inputs
 *  - Shows mismatch error when passwords differ
 *  - Calls api.post with token (from URL params) + password on valid submit
 *  - Shows success state after reset
 *  - Shows expired-token error when API returns "invalid" / "expired"
 *  - Shows generic error for other API failures
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate:  () => mockNavigate,
  useParams:    () => ({ token: 'reset_tok_abc' }),
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { post: vi.fn() },
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

import ResetPassword from '../pages/ResetPassword'
import api from '../lib/api'

// Helper: fill both password inputs
function fillPasswords(password = 'NewPass1!', confirm = 'NewPass1!') {
  fireEvent.change(document.querySelector('#reset-password'), { target: { value: password } })
  fireEvent.change(document.querySelector('#reset-confirm'),  { target: { value: confirm } })
}

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    render(<ResetPassword />)
  })

  it('renders new-password and confirm inputs', () => {
    expect(document.querySelector('#reset-password')).toBeInTheDocument()
    expect(document.querySelector('#reset-confirm')).toBeInTheDocument()
    expect(document.querySelector('button[type="submit"]')).toBeInTheDocument()
  })

  it('shows mismatch error when passwords do not match', async () => {
    fillPasswords('NewPass1!', 'Different1!')
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(screen.getByText('reset_password.error_mismatch')).toBeInTheDocument()
    })
    // API should NOT have been called
    expect(api.post).not.toHaveBeenCalled()
  })

  it('calls api.post with token from URL params and new password', async () => {
    api.post.mockResolvedValueOnce({})
    fillPasswords('NewPass1!')
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/auth/reset-password', {
        token:    'reset_tok_abc',
        password: 'NewPass1!',
      })
    })
  })

  it('shows success state after reset and hides form', async () => {
    api.post.mockResolvedValueOnce({})
    fillPasswords()
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(screen.getByText('reset_password.success')).toBeInTheDocument()
      expect(document.querySelector('button[type="submit"]')).not.toBeInTheDocument()
    })
  })

  it('shows expired-token error when API responds with "invalid"', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'Token invalid or expired' } },
    })
    fillPasswords()
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(screen.getByText('reset_password.error_expired')).toBeInTheDocument()
    })
  })

  it('shows expired-token error when API responds with "expired"', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'expired link' } },
    })
    fillPasswords()
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(screen.getByText('reset_password.error_expired')).toBeInTheDocument()
    })
  })

  it('shows generic error for other API failures', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'Server error' } },
    })
    fillPasswords()
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(screen.getByText('reset_password.error_default')).toBeInTheDocument()
    })
  })

  it('has a back-to-login link', () => {
    expect(document.querySelector('a[href="/login"]')).toBeInTheDocument()
  })
})
