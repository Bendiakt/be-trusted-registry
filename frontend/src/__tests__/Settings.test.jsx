/**
 * Tests for the Settings page (account + RGPD self-service).
 *
 * Covers:
 *  - Renders profile, RGPD export, and danger-zone sections
 *  - "Télécharger mes données" calls GET /api/auth/me/export (blob)
 *  - Delete flow opens a modal and calls DELETE /api/auth/me with the password
 *  - Profile save calls PATCH /api/auth/profile
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockApi = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: new Blob(['{}']) })),
  patch: vi.fn(() => Promise.resolve({ data: { name: 'New Name' } })),
  delete: vi.fn(() => Promise.resolve({ data: { message: 'ok' } })),
}))
vi.mock('../lib/api', () => ({ default: mockApi }))

const session = { id: 1, name: 'Jane', email: 'jane@test.com', role: 'company' }
vi.mock('../lib/session', () => ({
  getSession: () => session,
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

// Resolve i18n keys against the real English locale so assertions stay readable.
import en from '../locales/en.json'
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), en) ?? key }),
}))

import Settings from '../pages/Settings'

describe('Settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the three sections', () => {
    render(<Settings />)
    expect(screen.getByRole('heading', { name: en.settings.profile })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: en.settings.data_heading })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: en.settings.delete_heading })).toBeInTheDocument()
  })

  it('export button calls GET /api/auth/me/export as a blob', async () => {
    // jsdom lacks URL.createObjectURL — stub it
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    global.URL.revokeObjectURL = vi.fn()
    render(<Settings />)
    fireEvent.click(screen.getByText(new RegExp(en.settings.download_data)))
    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith('/api/auth/me/export', { responseType: 'blob' })
    })
  })

  it('delete flow confirms with password and calls DELETE /api/auth/me', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:x')
    const { container } = render(<Settings />)
    // open modal (the danger-zone trigger button)
    fireEvent.click(screen.getByRole('button', { name: en.settings.delete_button }))
    const pwd = container.querySelector('#del-pass')
    expect(pwd).toBeTruthy()
    fireEvent.change(pwd, { target: { value: 'secret123' } })
    fireEvent.click(screen.getByText(en.settings.delete_permanently))
    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith('/api/auth/me', { data: { password: 'secret123' } })
    })
  })

  it('saving a new name calls PATCH /api/auth/profile', async () => {
    const { container } = render(<Settings />)
    fireEvent.change(container.querySelector('#set-name'), { target: { value: 'Janet' } })
    fireEvent.click(screen.getByText(en.settings.save))
    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith('/api/auth/profile', { name: 'Janet' })
    })
  })
})
