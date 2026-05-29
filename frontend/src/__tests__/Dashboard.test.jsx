/**
 * Tests for Dashboard page.
 *
 * Auth guard: redirects non-company roles away.
 * On mount calls GET /api/companies/me then GET /api/documents.
 *
 * Covers:
 *  - Redirects to /login when no session
 *  - Redirects pac/admin/trader to their portal
 *  - Renders nav MyDD logo for company role
 *  - Renders all 6 tab buttons (overview, register, pricing, documents, billing, developer, metrics)
 *  - Calls GET /api/companies/me on mount
 *  - Shows user name in nav after profile loads
 *  - Shows email-verification banner when emailVerified=false
 *  - Logout calls api.post + clearSession + navigates to /login
 *  - Overview tab renders onboarding stepper when no company
 *  - WebSocket constructor called on mount (notification channel)
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

// WebSocket mock — must be defined before component import
const mockWsClose = vi.fn()
const MockWebSocket = vi.fn().mockImplementation(() => ({
  close:     mockWsClose,
  onmessage: null,
  onerror:   null,
}))
global.WebSocket = MockWebSocket

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

vi.mock('../lib/session', () => ({
  getSession:   vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('../components/MetricsDashboard', () => ({
  default: () => <div data-testid="metrics-dashboard" />,
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

vi.mock('../components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}))

vi.mock('../components/Toast', () => ({
  useToast:       () => [[], vi.fn()],
  ToastContainer: () => <div data-testid="toast-container" />,
}))

import Dashboard from '../pages/Dashboard'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'

const COMPANY_SESSION = { id: 10, name: 'Test Company', email: 'test@co.com', role: 'company' }
const UNVERIFIED_SESSION = { ...COMPANY_SESSION, emailVerified: false }

const PROFILE_RESPONSE = {
  data: {
    company: { id: 1, name: 'Test Corp', certificationLevel: 2, status: 'active' },
    user:    { id: 10, name: 'Test Company', email: 'test@co.com', role: 'company', emailVerified: true },
  },
}

const UNVERIFIED_PROFILE = {
  data: {
    company: null,
    user:    { id: 10, name: 'Test Company', email: 'test@co.com', role: 'company', emailVerified: false },
  },
}

function mockCompanySession(profileRes = PROFILE_RESPONSE) {
  getSession.mockReturnValue(COMPANY_SESSION)
  // URL-aware mock: correct response regardless of effect firing order
  api.get.mockImplementation((url) => {
    if (url === '/api/companies/me') return Promise.resolve(profileRes)
    if (url === '/api/documents')    return Promise.resolve({ data: [] })
    return Promise.resolve({ data: [] })
  })
}

describe('Dashboard — auth guard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('redirects to /login when no session', () => {
    getSession.mockReturnValue(null)
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('redirects pac role to /pac', () => {
    getSession.mockReturnValue({ role: 'pac' })
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/pac')
  })

  it('redirects admin role to /admin', () => {
    getSession.mockReturnValue({ role: 'admin' })
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/admin')
  })

  it('redirects trader role to /trader', () => {
    getSession.mockReturnValue({ role: 'trader' })
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/trader')
  })
})

describe('Dashboard — UI', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders MyDD logo in nav', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('MyDD')).toBeInTheDocument())
  })

  it('renders all 6 tab buttons', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('dashboard.tabs.overview')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.register')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.pricing')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.documents')).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.billing', { exact: false })).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.developer', { exact: false })).toBeInTheDocument()
      expect(screen.getByText('dashboard.tabs.metrics')).toBeInTheDocument()
    })
  })

  it('calls GET /api/companies/me on mount', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/companies/me')
    })
  })

  it('shows user name in nav after profile loads', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument()
    })
  })

  it('shows email-verification banner when emailVerified=false', async () => {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me') return Promise.resolve(UNVERIFIED_PROFILE)
      return Promise.resolve({ data: [] })
    })
    render(<Dashboard />)
    await waitFor(() => {
      // Banner rendered when user.emailVerified === false
      expect(screen.getByText('dashboard.verify_email.title')).toBeInTheDocument()
    })
  })

  it('does NOT show email-verification banner when verified', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => screen.getByText('Test Company'))
    expect(screen.queryByText('dashboard.verify_email.banner_text')).not.toBeInTheDocument()
  })

  it('logout calls api.post + clearSession + navigates to /login', async () => {
    mockCompanySession()
    api.post.mockResolvedValueOnce({})
    render(<Dashboard />)
    await waitFor(() => screen.getByText('nav.logout'))

    fireEvent.click(screen.getByText('nav.logout'))
    await waitFor(() => {
      expect(clearSession).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  it('opens WebSocket notification channel on mount', async () => {
    mockCompanySession()
    render(<Dashboard />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(MockWebSocket).toHaveBeenCalledWith(
      expect.stringContaining('/ws/metrics')
    )
  })

  it('shows onboarding stepper when no company profile yet', async () => {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me')
        return Promise.resolve({ data: { company: null, user: { ...COMPANY_SESSION, emailVerified: true } } })
      return Promise.resolve({ data: [] })
    })
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('dashboard.onboarding.title')).toBeInTheDocument()
    })
  })
})

describe('Dashboard — missions (audits) tab', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const MISSION_UNPAID = {
    id: 42, company_name: 'Test Corp', location: 'Paris, FR',
    type: 'site_inspection', status: 'assigned', outcome: null,
    feeUsd: 500, paymentConfirmedAt: null, completedAt: null,
    createdAt: '2026-04-01T00:00:00Z',
  }

  const MISSION_PAID = {
    id: 43, company_name: 'Test Corp', location: 'Lyon, FR',
    type: 'document_check', status: 'completed', outcome: 'pass',
    feeUsd: 300, paymentConfirmedAt: '2026-05-10T00:00:00Z', completedAt: '2026-05-09T00:00:00Z',
    createdAt: '2026-04-10T00:00:00Z',
  }

  function mockWithMissions(missions) {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me') return Promise.resolve(PROFILE_RESPONSE)
      if (url.startsWith('/api/companies/missions')) return Promise.resolve({ data: { missions } })
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/test' } })
  }

  it('renders Audits tab button', async () => {
    mockWithMissions([])
    render(<Dashboard />)
    await waitFor(() => {
      expect(screen.getByText('dashboard.tabs.audits')).toBeInTheDocument()
    })
  })

  it('clicking Audits tab calls GET /api/companies/missions', async () => {
    mockWithMissions([])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/api/companies/missions'))
    })
  })

  it('shows pay button for mission with unpaid fee', async () => {
    mockWithMissions([MISSION_UNPAID])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      // t() mock returns key; Dashboard renders t('dashboard.audits.pay_fee', { amount: feeUsd })
      expect(screen.getByText('dashboard.audits.pay_fee')).toBeInTheDocument()
    })
  })

  it('shows paid badge for mission with confirmed payment', async () => {
    mockWithMissions([MISSION_PAID])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      // t() mock returns key; Dashboard renders t('dashboard.audits.fee_paid', { amount: feeUsd })
      expect(screen.getByText('dashboard.audits.fee_paid')).toBeInTheDocument()
    })
  })

  it('pay button calls POST /api/payments/mission-checkout with missionId', async () => {
    mockWithMissions([MISSION_UNPAID])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => screen.getByText('dashboard.audits.pay_fee'))
    fireEvent.click(screen.getByText('dashboard.audits.pay_fee'))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/api/payments/mission-checkout',
        { missionId: 42 },
      )
    })
  })

  it('shows no-missions message when missions list is empty', async () => {
    mockWithMissions([])
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.audits'))
    fireEvent.click(screen.getByText('dashboard.tabs.audits'))
    await waitFor(() => {
      // t() mock returns key → empty state text is the i18n key
      expect(screen.getByText('dashboard.audits.empty')).toBeInTheDocument()
    })
  })
})

// ── NotificationsPanel ────────────────────────────────────────────────────────
describe('Dashboard — notifications tab', () => {
  const NOTIFS_EMPTY  = { notifications: [], unread: 0 }
  const NOTIFS_LIST   = {
    unread: 2,
    notifications: [
      { id: 1, type: 'mission_assigned', title: 'Mission assigned', body: 'PAC agent Bob assigned', link: null, read: false, createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
      { id: 2, type: 'payment_confirmed', title: 'Payment received', body: null, link: '/dashboard', read: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 3, type: 'cert_update', title: 'Certificate ready', body: null, link: null, read: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
    ],
  }

  function mockWithNotifs(notifData) {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me')  return Promise.resolve(PROFILE_RESPONSE)
      if (url === '/api/documents')     return Promise.resolve({ data: [] })
      if (url === '/api/notifications') return Promise.resolve({ data: notifData })
      return Promise.resolve({ data: [] })
    })
    api.patch.mockResolvedValue({ data: {} })
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders notifications tab button', async () => {
    mockWithNotifs(NOTIFS_EMPTY)
    render(<Dashboard />)
    await waitFor(() => expect(screen.getByText('dashboard.tabs.notifications')).toBeInTheDocument())
  })

  it('calls GET /api/notifications when tab is opened', async () => {
    mockWithNotifs(NOTIFS_EMPTY)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/notifications')
    })
  })

  it('shows empty-state when no notifications', async () => {
    mockWithNotifs(NOTIFS_EMPTY)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByText('dashboard.notifications.empty')).toBeInTheDocument()
      expect(screen.getByText('dashboard.notifications.empty_sub')).toBeInTheDocument()
    })
  })

  it('renders notification titles in the list', async () => {
    mockWithNotifs(NOTIFS_LIST)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByText('Mission assigned')).toBeInTheDocument()
      expect(screen.getByText('Payment received')).toBeInTheDocument()
      expect(screen.getByText('Certificate ready')).toBeInTheDocument()
    })
  })

  it('shows unread count badge when there are unread notifications', async () => {
    mockWithNotifs(NOTIFS_LIST)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      // t() mock returns key; badge renders t('dashboard.notifications.unread_count', { count: 2 })
      expect(screen.getByText('dashboard.notifications.unread_count')).toBeInTheDocument()
    })
  })

  it('shows mark-all-read button when there are unread notifications', async () => {
    mockWithNotifs(NOTIFS_LIST)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByText('dashboard.notifications.mark_all_read')).toBeInTheDocument()
    })
  })

  it('calls PATCH /api/notifications/read-all when mark-all clicked', async () => {
    mockWithNotifs(NOTIFS_LIST)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => screen.getByText('dashboard.notifications.mark_all_read'))
    fireEvent.click(screen.getByText('dashboard.notifications.mark_all_read'))
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/notifications/read-all')
    })
  })

  it('calls PATCH /api/notifications/:id/read when mark-read clicked on one item', async () => {
    mockWithNotifs(NOTIFS_LIST)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    // Two unread items have a mark-read button; click the first
    await waitFor(() => {
      const btns = screen.getAllByText('dashboard.notifications.mark_read')
      expect(btns.length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getAllByText('dashboard.notifications.mark_read')[0])
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/notifications\/\d+\/read/))
    })
  })

  it('shows refresh button in header', async () => {
    mockWithNotifs(NOTIFS_EMPTY)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByText(/dashboard\.notifications\.refresh/)).toBeInTheDocument()
    })
  })

  it('shows error message when API call fails', async () => {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me')  return Promise.resolve(PROFILE_RESPONSE)
      if (url === '/api/documents')     return Promise.resolve({ data: [] })
      if (url === '/api/notifications') return Promise.reject(new Error('Network error'))
      return Promise.resolve({ data: [] })
    })
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByText('dashboard.notifications.error')).toBeInTheDocument()
    })
  })

  it('shows all-caught-up banner when all notifications are read', async () => {
    mockWithNotifs({
      unread: 0,
      notifications: [
        { id: 5, type: 'cert_update', title: 'All done', body: null, link: null, read: true, createdAt: new Date().toISOString() },
      ],
    })
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByText(/dashboard\.notifications\.all_caught_up/)).toBeInTheDocument()
    })
  })
})

// ── notifications: delete ─────────────────────────────────────────────────────
describe('Dashboard — notifications: delete', () => {
  const NOTIFS_WITH_READ = {
    unread: 2,
    notifications: [
      { id: 1, type: 'mission_assigned', title: 'Mission assigned', body: null, link: null, read: false, createdAt: new Date().toISOString() },
      { id: 2, type: 'payment_confirmed', title: 'Payment received', body: null, link: null, read: false, createdAt: new Date().toISOString() },
      { id: 3, type: 'cert_update',       title: 'Certificate ready', body: null, link: null, read: true,  createdAt: new Date().toISOString() },
    ],
  }

  function mockWithDelete(notifData) {
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me')  return Promise.resolve(PROFILE_RESPONSE)
      if (url === '/api/documents')     return Promise.resolve({ data: [] })
      if (url === '/api/notifications') return Promise.resolve({ data: notifData })
      return Promise.resolve({ data: [] })
    })
    api.patch.mockResolvedValue({ data: {} })
    api.delete.mockResolvedValue({ data: {} })
  }

  beforeEach(() => { vi.clearAllMocks() })

  it('renders a delete button for each notification', async () => {
    mockWithDelete(NOTIFS_WITH_READ)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByTestId('notif-delete-1')).toBeInTheDocument()
      expect(screen.getByTestId('notif-delete-2')).toBeInTheDocument()
      expect(screen.getByTestId('notif-delete-3')).toBeInTheDocument()
    })
  })

  it('calls DELETE /api/notifications/:id when delete button clicked', async () => {
    mockWithDelete(NOTIFS_WITH_READ)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => screen.getByTestId('notif-delete-1'))
    fireEvent.click(screen.getByTestId('notif-delete-1'))
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/notifications/1')
    })
  })

  it('removes the notification from the list after delete', async () => {
    mockWithDelete(NOTIFS_WITH_READ)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => screen.getByText('Mission assigned'))
    fireEvent.click(screen.getByTestId('notif-delete-1'))
    await waitFor(() => {
      expect(screen.queryByText('Mission assigned')).not.toBeInTheDocument()
    })
  })

  it('shows clear-read button when read notifications exist', async () => {
    mockWithDelete(NOTIFS_WITH_READ)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => {
      expect(screen.getByTestId('notif-clear-read')).toBeInTheDocument()
    })
  })

  it('does not show clear-read button when all notifications are unread', async () => {
    mockWithDelete({
      unread: 1,
      notifications: [
        { id: 1, type: 'mission_assigned', title: 'Mission assigned', body: null, link: null, read: false, createdAt: new Date().toISOString() },
      ],
    })
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => screen.getByText('Mission assigned'))
    expect(screen.queryByTestId('notif-clear-read')).not.toBeInTheDocument()
  })

  it('calls DELETE /api/notifications when clear-read button clicked', async () => {
    mockWithDelete(NOTIFS_WITH_READ)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => screen.getByTestId('notif-clear-read'))
    fireEvent.click(screen.getByTestId('notif-clear-read'))
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/notifications')
    })
  })

  it('removes only read notifications from the list after clear-read', async () => {
    mockWithDelete(NOTIFS_WITH_READ)
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.notifications'))
    fireEvent.click(screen.getByText('dashboard.tabs.notifications'))
    await waitFor(() => screen.getByText('Certificate ready'))
    fireEvent.click(screen.getByTestId('notif-clear-read'))
    await waitFor(() => {
      expect(screen.queryByText('Certificate ready')).not.toBeInTheDocument()
      expect(screen.getByText('Mission assigned')).toBeInTheDocument()
      expect(screen.getByText('Payment received')).toBeInTheDocument()
    })
  })
})

// ── Profile Settings tab ──────────────────────────────────────────────────────

const COMPANY_WITH_PROFILE = {
  data: {
    company: { id: 1, name: 'Acme Corp', companyName: 'Acme Corp', sector: 'Manufacturing', country: 'FR', website: 'https://acme.com', certificationLevel: 1, status: 'active' },
    user:    { id: 10, name: 'Acme Corp', email: 'ceo@acme.com', role: 'company', emailVerified: true },
  },
}

describe('Dashboard — Profile Settings tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSession.mockReturnValue(COMPANY_SESSION)
    api.get.mockImplementation((url) => {
      if (url === '/api/companies/me') return Promise.resolve(COMPANY_WITH_PROFILE)
      if (url === '/api/documents')    return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })
  })

  it('renders Settings tab button', async () => {
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.settings'))
    expect(screen.getByText('dashboard.tabs.settings')).toBeInTheDocument()
  })

  it('shows settings form with pre-filled company name', async () => {
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.settings'))
    fireEvent.click(screen.getByText('dashboard.tabs.settings'))
    await waitFor(() => {
      const input = screen.getByTestId('settings-company-name')
      expect(input).toBeInTheDocument()
      expect(input.value).toBe('Acme Corp')
    })
  })

  it('pre-fills sector and country from company profile', async () => {
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.settings'))
    fireEvent.click(screen.getByText('dashboard.tabs.settings'))
    await waitFor(() => {
      expect(screen.getByTestId('settings-sector').value).toBe('Manufacturing')
      expect(screen.getByTestId('settings-country').value).toBe('FR')
    })
  })

  it('pre-fills website from company profile', async () => {
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.settings'))
    fireEvent.click(screen.getByText('dashboard.tabs.settings'))
    await waitFor(() => {
      expect(screen.getByTestId('settings-website').value).toBe('https://acme.com')
    })
  })

  it('PATCH /api/companies/me is called on form submit', async () => {
    api.patch.mockResolvedValueOnce({
      data: { company: { ...COMPANY_WITH_PROFILE.data.company, companyName: 'Acme Corp Updated' } },
    })
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.settings'))
    fireEvent.click(screen.getByText('dashboard.tabs.settings'))
    await waitFor(() => screen.getByTestId('settings-save-btn'))
    fireEvent.click(screen.getByTestId('settings-save-btn'))
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/companies/me', expect.objectContaining({
        companyName: 'Acme Corp',
        sector:      'Manufacturing',
        country:     'FR',
        website:     'https://acme.com',
      }))
    })
  })

  it('shows success banner after successful PATCH', async () => {
    api.patch.mockResolvedValueOnce({ data: { company: COMPANY_WITH_PROFILE.data.company } })
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.settings'))
    fireEvent.click(screen.getByText('dashboard.tabs.settings'))
    await waitFor(() => screen.getByTestId('settings-save-btn'))
    fireEvent.click(screen.getByTestId('settings-save-btn'))
    await waitFor(() => {
      expect(screen.getByText(/dashboard\.settings\.saved/)).toBeInTheDocument()
    })
  })

  it('shows error message when PATCH fails', async () => {
    api.patch.mockRejectedValueOnce({
      response: { data: { error: 'Website must start with http://' } },
    })
    render(<Dashboard />)
    await waitFor(() => screen.getByText('dashboard.tabs.settings'))
    fireEvent.click(screen.getByText('dashboard.tabs.settings'))
    await waitFor(() => screen.getByTestId('settings-save-btn'))
    fireEvent.click(screen.getByTestId('settings-save-btn'))
    await waitFor(() => {
      expect(screen.getByText('Website must start with http://')).toBeInTheDocument()
    })
  })
})
