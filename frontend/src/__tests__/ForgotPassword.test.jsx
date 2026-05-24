/**
 * Tests for ForgotPassword page.
 *
 * Covers:
 *  - Renders the form
 *  - Calls api.post with email on submit
 *  - Shows success state after API resolves
 *  - Shows error state when API rejects
 *  - Back-to-login link present
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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

import ForgotPassword from '../pages/ForgotPassword'
import api from '../lib/api'

describe('ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    render(<ForgotPassword />)
  })

  it('renders email input and submit button', () => {
    expect(document.querySelector('#forgot-email')).toBeInTheDocument()
    expect(document.querySelector('button[type="submit"]')).toBeInTheDocument()
  })

  it('calls api.post /api/auth/forgot-password with the entered email', async () => {
    api.post.mockResolvedValueOnce({})
    fireEvent.change(document.querySelector('#forgot-email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/auth/forgot-password', {
        email: 'user@example.com',
      })
    })
  })

  it('shows success message after API resolves (email envelope + success key)', async () => {
    api.post.mockResolvedValueOnce({})
    fireEvent.change(document.querySelector('#forgot-email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      // Success banner renders the i18n key (stub returns key)
      expect(screen.getByText('forgot_password.success')).toBeInTheDocument()
      // Form is replaced by success state — no submit button
      expect(document.querySelector('button[type="submit"]')).not.toBeInTheDocument()
    })
  })

  it('shows error key when api.post rejects', async () => {
    api.post.mockRejectedValueOnce(new Error('network'))
    fireEvent.change(document.querySelector('#forgot-email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => {
      expect(screen.getByText('forgot_password.error_default')).toBeInTheDocument()
    })
  })

  it('has a back-to-login link', () => {
    const link = document.querySelector('a[href="/login"]')
    expect(link).toBeInTheDocument()
  })
})
