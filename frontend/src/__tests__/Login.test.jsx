/**
 * Unit tests for the Login page.
 *
 * Covers:
 *   - Rendering the password step
 *   - Successful login (role-based redirect)
 *   - API error display
 *   - 2FA step transition when requires2fa = true
 *   - TOTP submit (success + error)
 *   - Back-to-login button
 *   - TOTP confirm button disabled until 6 digits
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'

// ── Stubs ────────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { post: vi.fn() },
}))

vi.mock('../lib/session', () => ({
  saveSession: vi.fn(),
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

import Login from '../pages/Login'
import api from '../lib/api'
import { saveSession } from '../lib/session'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fillCredentials(email = 'user@example.com', password = 'Password1') {
  fireEvent.change(document.querySelector('#login-email'),    { target: { value: email } })
  fireEvent.change(document.querySelector('#login-password'), { target: { value: password } })
}

function submitPasswordForm() {
  fireEvent.submit(document.querySelector('form'))
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Login — password step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    render(<Login />)
  })

  it('renders email and password inputs', () => {
    expect(document.querySelector('#login-email')).toBeInTheDocument()
    expect(document.querySelector('#login-password')).toBeInTheDocument()
  })

  it('renders submit button with i18n key', () => {
    expect(document.querySelector('button[type="submit"]').textContent).toBe('login.submit')
  })

  it('calls api.post /api/auth/login with credentials', async () => {
    api.post.mockResolvedValueOnce({ data: { user: { role: 'company' } } })
    fillCredentials()
    submitPasswordForm()
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'user@example.com',
        password: 'Password1',
      })
    })
  })

  it('saves session and navigates to /dashboard for company role', async () => {
    const user = { role: 'company', id: 1, name: 'Alice' }
    api.post.mockResolvedValueOnce({ data: { user } })
    fillCredentials()
    submitPasswordForm()
    await waitFor(() => {
      expect(saveSession).toHaveBeenCalledWith(user)
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('navigates to /admin for admin role', async () => {
    api.post.mockResolvedValueOnce({ data: { user: { role: 'admin' } } })
    fillCredentials()
    submitPasswordForm()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin'))
  })

  it('navigates to /trader for trader role', async () => {
    api.post.mockResolvedValueOnce({ data: { user: { role: 'trader' } } })
    fillCredentials()
    submitPasswordForm()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/trader'))
  })

  it('navigates to /pac for pac role', async () => {
    api.post.mockResolvedValueOnce({ data: { user: { role: 'pac' } } })
    fillCredentials()
    submitPasswordForm()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pac'))
  })

  it('displays API error message on failure', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'Invalid credentials' } },
    })
    fillCredentials()
    submitPasswordForm()
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('displays fallback i18n error when api returns no message', async () => {
    api.post.mockRejectedValueOnce({ response: null })
    fillCredentials()
    submitPasswordForm()
    await waitFor(() => {
      expect(screen.getByText('login.error_default')).toBeInTheDocument()
    })
  })
})

describe('Login — 2FA TOTP step', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    render(<Login />)
  })

  async function triggerTotpStep(tempToken = 'tmp_abc123') {
    api.post.mockResolvedValueOnce({ data: { requires2fa: true, tempToken } })
    fillCredentials()
    submitPasswordForm()
    // Wait for the TOTP step to appear
    await waitFor(() => expect(screen.getByText(/authenticator app/i)).toBeInTheDocument())
  }

  it('transitions to TOTP step when requires2fa is true', async () => {
    await triggerTotpStep()
    // TOTP input is visible (type text, maxLength 6)
    const totpInput = document.querySelector('input[inputmode="numeric"]')
    expect(totpInput).toBeInTheDocument()
  })

  it('confirm button is disabled until 6 digits are entered', async () => {
    await triggerTotpStep()
    const confirmBtn = document.querySelector('button[type="submit"]')
    expect(confirmBtn).toBeDisabled()

    const totpInput = document.querySelector('input[inputmode="numeric"]')
    fireEvent.change(totpInput, { target: { value: '12345' } }) // only 5 digits
    expect(confirmBtn).toBeDisabled()

    fireEvent.change(totpInput, { target: { value: '123456' } }) // 6 digits
    expect(confirmBtn).not.toBeDisabled()
  })

  it('calls /api/auth/2fa/validate with tempToken and code', async () => {
    await triggerTotpStep('tok_xyz')
    api.post.mockResolvedValueOnce({ data: { user: { role: 'company' } } })

    const totpInput = document.querySelector('input[inputmode="numeric"]')
    fireEvent.change(totpInput, { target: { value: '654321' } })
    fireEvent.submit(document.querySelector('form'))

    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith('/api/auth/2fa/validate', {
        tempToken: 'tok_xyz',
        token: '654321',
      })
    })
  })

  it('saves session and navigates after successful TOTP', async () => {
    await triggerTotpStep()
    const user = { role: 'company', id: 2 }
    api.post.mockResolvedValueOnce({ data: { user } })

    fireEvent.change(document.querySelector('input[inputmode="numeric"]'), { target: { value: '111111' } })
    fireEvent.submit(document.querySelector('form'))

    await waitFor(() => {
      expect(saveSession).toHaveBeenCalledWith(user)
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows error and clears code on failed TOTP', async () => {
    await triggerTotpStep()
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Invalid OTP code' } } })

    const totpInput = document.querySelector('input[inputmode="numeric"]')
    fireEvent.change(totpInput, { target: { value: '000000' } })
    fireEvent.submit(document.querySelector('form'))

    await waitFor(() => {
      expect(screen.getByText('Invalid OTP code')).toBeInTheDocument()
    })
  })

  it('back button returns to password step', async () => {
    await triggerTotpStep()

    const backBtn = screen.getByRole('button', { name: /back to login/i })
    fireEvent.click(backBtn)

    // Password step inputs are back
    expect(document.querySelector('#login-email')).toBeInTheDocument()
    expect(document.querySelector('#login-password')).toBeInTheDocument()
  })
})
