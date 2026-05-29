/**
 * Components.test.jsx
 *
 * Unit tests for small shared components:
 *   - ErrorBoundary  — catches render errors, shows fallback UI
 *   - ToastContainer / useToast — renders toasts, auto-dismiss
 *   - OfflineBanner  — listens to online/offline events, shows sticky alert
 *   - CookieBanner   — GDPR consent: hides when already decided, shows after 800ms, accept/decline
 *   - LanguageSwitcher — dropdown, calls i18n.changeLanguage
 */
import { render, screen, waitFor, fireEvent, act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'

// ── shared mocks ──────────────────────────────────────────────────────────────

const mockChangeLanguage = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k) => k,
    i18n: { language: 'en', changeLanguage: mockChangeLanguage },
  }),
}))

// Mock the i18n LANGUAGES constant so we don't pull in the full bundle
vi.mock('../i18n', () => ({
  LANGUAGES: [
    { code: 'en', label: 'English',  flag: '🇬🇧', dir: 'ltr' },
    { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  ],
}))

import ErrorBoundary       from '../components/ErrorBoundary'
import { ToastContainer, useToast } from '../components/Toast'
import OfflineBanner        from '../components/OfflineBanner'
import CookieBanner         from '../components/CookieBanner'
import LanguageSwitcher     from '../components/LanguageSwitcher'

// ── ErrorBoundary ─────────────────────────────────────────────────────────────

// A child that can be made to throw
function MaybeThrow({ shouldThrow, message = 'Test render error' }) {
  if (shouldThrow) throw new Error(message)
  return <div>safe content</div>
}

describe('ErrorBoundary', () => {
  // Suppress React's console.error noise for error-boundary tests
  let originalConsoleError
  beforeAll(() => { originalConsoleError = console.error; console.error = vi.fn() })
  afterAll(() => { console.error = originalConsoleError })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <MaybeThrow shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('safe content')).toBeInTheDocument()
  })

  it('shows fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <MaybeThrow shouldThrow message="Boom" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Boom')).toBeInTheDocument()
  })

  it('renders "Back to Home" and "Retry" buttons in the fallback', () => {
    render(
      <ErrorBoundary>
        <MaybeThrow shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('Retry button calls window.location.reload', () => {
    // jsdom marks location.reload as non-configurable; use vi.stubGlobal
    const reloadSpy = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy })
    render(
      <ErrorBoundary>
        <MaybeThrow shouldThrow />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(reloadSpy).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// ── Toast / useToast ──────────────────────────────────────────────────────────

describe('ToastContainer', () => {
  it('returns null when toasts array is empty', () => {
    const { container } = render(<ToastContainer toasts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a success toast message', () => {
    const toasts = [{ id: 1, message: 'Saved!', type: 'success' }]
    render(<ToastContainer toasts={toasts} />)
    expect(screen.getByText('Saved!')).toBeInTheDocument()
  })

  it('renders an error toast message', () => {
    const toasts = [{ id: 2, message: 'Something failed', type: 'error' }]
    render(<ToastContainer toasts={toasts} />)
    expect(screen.getByText('Something failed')).toBeInTheDocument()
  })

  it('renders multiple toasts simultaneously', () => {
    const toasts = [
      { id: 1, message: 'First', type: 'success' },
      { id: 2, message: 'Second', type: 'info' },
    ]
    render(<ToastContainer toasts={toasts} />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})

describe('useToast hook', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('starts with an empty toasts array', () => {
    const { result } = renderHook(() => useToast())
    const [toasts] = result.current
    expect(toasts).toHaveLength(0)
  })

  it('showToast adds a toast to the list', () => {
    const { result } = renderHook(() => useToast())
    act(() => { result.current[1]('Hello') })
    expect(result.current[0]).toHaveLength(1)
    expect(result.current[0][0].message).toBe('Hello')
  })

  it('toast is removed after 3.5 seconds', () => {
    const { result } = renderHook(() => useToast())
    act(() => { result.current[1]('Bye soon') })
    expect(result.current[0]).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(3500) })
    expect(result.current[0]).toHaveLength(0)
  })
})

// ── OfflineBanner ─────────────────────────────────────────────────────────────

describe('OfflineBanner', () => {
  it('returns null when navigator.onLine is true (default)', () => {
    const { container } = render(<OfflineBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the alert banner after app:offline event', async () => {
    render(<OfflineBanner />)
    act(() => window.dispatchEvent(new Event('app:offline')))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('offline.message')).toBeInTheDocument()
  })

  it('shows the alert banner after native offline event', async () => {
    render(<OfflineBanner />)
    act(() => window.dispatchEvent(new Event('offline')))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('hides the alert banner after app:online event', async () => {
    render(<OfflineBanner />)
    act(() => window.dispatchEvent(new Event('app:offline')))
    await waitFor(() => screen.getByRole('alert'))
    act(() => window.dispatchEvent(new Event('app:online')))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('renders with role="alert" and aria-live="assertive"', async () => {
    render(<OfflineBanner />)
    act(() => window.dispatchEvent(new Event('app:offline')))
    await waitFor(() => {
      const el = screen.getByRole('alert')
      expect(el).toHaveAttribute('aria-live', 'assertive')
    })
  })
})

// ── CookieBanner ──────────────────────────────────────────────────────────────

const COOKIE_KEY = 'mydd_cookie_consent'

describe('CookieBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('does not render immediately (800ms delay)', () => {
    localStorage.removeItem(COOKIE_KEY)
    render(<CookieBanner />)
    // before timer fires — banner not visible
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog after 800ms when no prior consent', () => {
    localStorage.removeItem(COOKIE_KEY)
    render(<CookieBanner />)
    act(() => vi.advanceTimersByTime(900))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('never renders when localStorage already has accepted consent', () => {
    localStorage.setItem(COOKIE_KEY, 'accepted')
    render(<CookieBanner />)
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Accept button sets localStorage to "accepted" and hides banner', () => {
    localStorage.removeItem(COOKIE_KEY)
    render(<CookieBanner />)
    act(() => vi.advanceTimersByTime(900))
    fireEvent.click(screen.getByText('cookie.accept'))
    expect(localStorage.getItem(COOKIE_KEY)).toBe('accepted')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Decline button sets localStorage to "declined" and hides banner', () => {
    localStorage.removeItem(COOKIE_KEY)
    render(<CookieBanner />)
    act(() => vi.advanceTimersByTime(900))
    fireEvent.click(screen.getByText('cookie.decline'))
    expect(localStorage.getItem(COOKIE_KEY)).toBe('declined')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

// ── LanguageSwitcher ──────────────────────────────────────────────────────────

describe('LanguageSwitcher', () => {
  beforeEach(() => { mockChangeLanguage.mockReset() })

  it('renders the current language code (EN)', () => {
    render(<LanguageSwitcher />)
    expect(screen.getByText('EN')).toBeInTheDocument()
  })

  it('clicking the button opens the language dropdown', () => {
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /select language/i }))
    expect(screen.getByText('English')).toBeInTheDocument()
    expect(screen.getByText('Français')).toBeInTheDocument()
  })

  it('clicking a language option calls i18n.changeLanguage', () => {
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /select language/i }))
    fireEvent.click(screen.getByText('Français'))
    expect(mockChangeLanguage).toHaveBeenCalledWith('fr')
  })

  it('dropdown closes after language selection', () => {
    render(<LanguageSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /select language/i }))
    expect(screen.getByText('Français')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Français'))
    // dropdown should close — 'Français' no longer in dropdown (only in button area if selected)
    expect(screen.queryByText('English')).not.toBeInTheDocument()
  })
})
