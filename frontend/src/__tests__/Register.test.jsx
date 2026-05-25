/**
 * Integration-style tests for the Register page.
 *
 * Strategy: mock the api module and react-router-dom so we can
 * exercise the form without a real backend or router.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// ── Stubs ────────────────────────────────────────────────────────────────────
// react-router-dom: stub useNavigate and Link
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

// react-i18next: stub useTranslation so no i18n setup is needed
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key, // return the key itself as the translation
  }),
}))

// api lib: default to resolving; individual tests can override
vi.mock('../lib/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

// LanguageSwitcher: trivial stub
vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

import Register from '../pages/Register'
import api from '../lib/api'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fillForm({ name = 'John Doe', email = 'john@example.com', password = 'Password1' } = {}) {
  // The Register form uses inline styles without htmlFor, so we query by input type.
  const inputs = document.querySelectorAll('input')
  // inputs[0] = text (name), inputs[1] = email, inputs[2] = password, inputs[3] = CGU checkbox
  if (name)     fireEvent.change(inputs[0], { target: { value: name } })
  if (email)    fireEvent.change(inputs[1], { target: { value: email } })
  if (password) fireEvent.change(inputs[2], { target: { value: password } })
  // CGU checkbox must be checked or handleSubmit returns early
  fireEvent.click(inputs[3])
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    render(<Register />)
  })

  it('renders the registration form', () => {
    expect(document.querySelector('input[type="text"]')).toBeInTheDocument()
    expect(document.querySelector('input[type="email"]')).toBeInTheDocument()
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument()
    expect(document.querySelector('button[type="submit"]')).toBeInTheDocument()
  })

  it('shows the submit button text from i18n key', () => {
    const btn = document.querySelector('button[type="submit"]')
    // In stub, t('register.submit') returns 'register.submit'
    expect(btn.textContent).toBe('register.submit')
  })

  it('calls api.post when form is submitted with valid data', async () => {
    fillForm()
    fireEvent.click(document.querySelector('button[type="submit"]'))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
        email: 'john@example.com',
        password: 'Password1',
      }))
    })
  })

  it('displays error message when api.post rejects', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'Password must contain at least one uppercase letter' } },
    })

    fillForm({ password: 'password1' })
    fireEvent.click(document.querySelector('button[type="submit"]'))

    await waitFor(() => {
      expect(screen.getByText('Password must contain at least one uppercase letter')).toBeInTheDocument()
    })
  })

  it('displays fallback error when api returns no message', async () => {
    api.post.mockRejectedValueOnce({ response: null })
    fillForm()
    fireEvent.click(document.querySelector('button[type="submit"]'))

    await waitFor(() => {
      // t('register.error_default') returns the key in stub mode
      expect(screen.getByText('register.error_default')).toBeInTheDocument()
    })
  })
})
