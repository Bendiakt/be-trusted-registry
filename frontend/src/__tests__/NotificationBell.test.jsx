/**
 * NotificationBell.test.jsx
 *
 * Covers:
 *  - Fetches GET /api/notifications on mount
 *  - Shows unread badge when unread > 0; no badge when unread = 0
 *  - Bell click opens/closes the dropdown
 *  - Shows empty-state text when items = []
 *  - Lists notification title and body
 *  - "Mark all read" calls PATCH /api/notifications/read-all → zeroes badge
 *  - Clicking a notification row calls PATCH /api/notifications/:id/read
 *  - Re-fetches when refreshTrigger prop increments
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}))

import NotificationBell from '../components/NotificationBell'
import api from '../lib/api'

// ── fixtures ──────────────────────────────────────────────────────────────────

const NOTIF_UNREAD = {
  notifications: [
    { id: 1, type: 'cert_granted', title: 'Certification granted', body: 'Level 2 achieved', read: false, createdAt: new Date().toISOString(), link: '/dashboard' },
    { id: 2, type: 'info',         title: 'Welcome to MyDD',      body: null,                read: true,  createdAt: new Date().toISOString(), link: null },
  ],
  unread: 1,
}

const NOTIF_EMPTY = {
  notifications: [],
  unread: 0,
}

// ── describe blocks ───────────────────────────────────────────────────────────

describe('NotificationBell — mount & badge', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fetches GET /api/notifications on mount', async () => {
    api.get.mockResolvedValueOnce({ data: NOTIF_EMPTY })
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/notifications'))
  })

  it('shows unread count badge when unread > 0', async () => {
    api.get.mockResolvedValueOnce({ data: NOTIF_UNREAD })
    render(<NotificationBell />)
    await waitFor(() => {
      // The badge renders the number as text: "1"
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('does not render a badge when unread is 0', async () => {
    api.get.mockResolvedValueOnce({ data: NOTIF_EMPTY })
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    // Badge "0" should not be present; check by absence of red-chip text
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('re-fetches when refreshTrigger prop increments', async () => {
    api.get.mockResolvedValue({ data: NOTIF_EMPTY })
    const { rerender } = render(<NotificationBell refreshTrigger={0} />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1))
    rerender(<NotificationBell refreshTrigger={1} />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })
})

describe('NotificationBell — dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: NOTIF_UNREAD })
  })

  it('dropdown is not visible before bell is clicked', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByText('notifications.title')).not.toBeInTheDocument()
  })

  it('clicking the bell opens the dropdown', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    expect(screen.getByText('notifications.title')).toBeInTheDocument()
  })

  it('shows notification title inside the dropdown', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    await waitFor(() => expect(screen.getByText('Certification granted')).toBeInTheDocument())
  })

  it('shows notification body text', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    expect(screen.getByText('Level 2 achieved')).toBeInTheDocument()
  })

  it('shows empty state text when no notifications', async () => {
    api.get.mockResolvedValue({ data: NOTIF_EMPTY })
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    await waitFor(() => expect(screen.getByText('notifications.empty')).toBeInTheDocument())
  })

  it('clicking the bell a second time closes the dropdown', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    const bell = screen.getByRole('button', { name: 'notifications.title' })
    fireEvent.click(bell)
    expect(screen.getByText('notifications.title')).toBeInTheDocument()
    fireEvent.click(bell)
    expect(screen.queryByText('notifications.title')).not.toBeInTheDocument()
  })
})

describe('NotificationBell — mark read actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: NOTIF_UNREAD })
  })

  it('"Mark all read" calls PATCH /api/notifications/read-all', async () => {
    api.patch.mockResolvedValueOnce({})
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    await waitFor(() => screen.getByText('notifications.mark_all_read'))
    fireEvent.click(screen.getByText('notifications.mark_all_read'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/notifications/read-all'),
    )
  })

  it('"Mark all read" zeroes the unread badge after success', async () => {
    api.patch.mockResolvedValueOnce({})
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    // verify badge is there
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    fireEvent.click(screen.getByText('notifications.mark_all_read'))
    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument())
  })

  it('clicking a notification row calls PATCH /api/notifications/:id/read', async () => {
    api.patch.mockResolvedValueOnce({})
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    await waitFor(() => screen.getByText('Certification granted'))
    // Click the unread notification row (id=1)
    fireEvent.click(screen.getByText('Certification granted'))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/api/notifications/1/read'),
    )
  })

  it('clicking a notification with a link navigates to it', async () => {
    api.patch.mockResolvedValueOnce({})
    render(<NotificationBell />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'notifications.title' }))
    await waitFor(() => screen.getByText('Certification granted'))
    fireEvent.click(screen.getByText('Certification granted'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })
})
