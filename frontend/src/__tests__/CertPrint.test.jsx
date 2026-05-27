/**
 * Tests for CertPrint page (printable certification document).
 *
 * Calls GET /api/verify/:id on mount (same endpoint as Verify page).
 * Three states: loading (spinner), error, success (certificate rendered).
 *
 * Covers:
 *  - Calls correct API endpoint with :id from useParams
 *  - Shows loading indicator while in-flight
 *  - Shows error message + registry link on failure
 *  - Renders company name in certificate
 *  - Renders the correct level badge label (Bronze / Silver / Gold)
 *  - "Not certified" text for level 0
 *  - Print and copy-link toolbar buttons present on success
 *  - Back button navigates to /verify/:id
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useParams:   () => ({ id: 'cert_xyz' }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

import CertPrint from '../pages/CertPrint'
import api from '../lib/api'

const CERT_DATA = {
  companyName: 'Global Supply Ltd',
  country:     'France',
  sector:      'Logistics',
  level:       2,
  status:      'active',
  verifiedAt:  '2025-06-01T00:00:00Z',
  certInfo: {
    expiresAt: '2026-06-01T00:00:00Z',
    expired:   false,
  },
}

describe('CertPrint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls GET /api/verify/cert_xyz on mount', async () => {
    api.get.mockResolvedValueOnce({ data: CERT_DATA })
    render(<CertPrint />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/verify/cert_xyz')
    })
  })

  it('shows loading spinner (◌) while API is in-flight', () => {
    api.get.mockReturnValueOnce(new Promise(() => {}))
    render(<CertPrint />)
    expect(screen.getByText('◌')).toBeInTheDocument()
  })

  it('shows error message and registry link when API rejects', async () => {
    api.get.mockRejectedValueOnce(new Error('not found'))
    render(<CertPrint />)
    await waitFor(() => {
      expect(screen.getByText('Certificate not found.')).toBeInTheDocument()
    })
    expect(document.querySelector('a[href="/registry"]')).toBeInTheDocument()
  })

  it('renders company name in certificate', async () => {
    api.get.mockResolvedValueOnce({ data: CERT_DATA })
    render(<CertPrint />)
    await waitFor(() => {
      expect(screen.getByText('Global Supply Ltd')).toBeInTheDocument()
    })
  })

  it('renders SILVER CERTIFIED badge for level 2', async () => {
    api.get.mockResolvedValueOnce({ data: CERT_DATA })
    render(<CertPrint />)
    await waitFor(() => {
      expect(screen.getByText('SILVER CERTIFIED')).toBeInTheDocument()
    })
  })

  it('renders BRONZE CERTIFIED badge for level 1', async () => {
    api.get.mockResolvedValueOnce({ data: { ...CERT_DATA, level: 1 } })
    render(<CertPrint />)
    await waitFor(() => {
      expect(screen.getByText('BRONZE CERTIFIED')).toBeInTheDocument()
    })
  })

  it('renders GOLD CERTIFIED badge for level 3', async () => {
    api.get.mockResolvedValueOnce({ data: { ...CERT_DATA, level: 3 } })
    render(<CertPrint />)
    await waitFor(() => {
      expect(screen.getByText('GOLD CERTIFIED')).toBeInTheDocument()
    })
  })

  it('renders "Not certified" for level 0', async () => {
    api.get.mockResolvedValueOnce({ data: { ...CERT_DATA, level: 0, certInfo: undefined } })
    render(<CertPrint />)
    await waitFor(() => {
      expect(screen.getByText('Not certified')).toBeInTheDocument()
    })
  })

  it('renders print button in toolbar', async () => {
    api.get.mockResolvedValueOnce({ data: CERT_DATA })
    render(<CertPrint />)
    await waitFor(() => screen.getByText('Global Supply Ltd'))
    expect(screen.getByText('cert_print.print_pdf')).toBeInTheDocument()
  })

  it('renders copy-link button in toolbar', async () => {
    api.get.mockResolvedValueOnce({ data: CERT_DATA })
    render(<CertPrint />)
    await waitFor(() => screen.getByText('Global Supply Ltd'))
    expect(screen.getByText('cert_print.copy_link')).toBeInTheDocument()
  })

  it('back button navigates to /verify/:id', async () => {
    api.get.mockResolvedValueOnce({ data: CERT_DATA })
    render(<CertPrint />)
    await waitFor(() => screen.getByText('Global Supply Ltd'))
    // First button in the no-print toolbar is the back button
    fireEvent.click(document.querySelector('.no-print button'))
    expect(mockNavigate).toHaveBeenCalledWith('/verify/cert_xyz')
  })

  it('renders download PDF button in toolbar', async () => {
    api.get.mockResolvedValueOnce({ data: CERT_DATA })
    render(<CertPrint />)
    await waitFor(() => screen.getByText('Global Supply Ltd'))
    expect(screen.getByText('cert_print.download_pdf')).toBeInTheDocument()
  })

  it('calls GET /api/verify/:id/pdf with blob responseType when download is clicked', async () => {
    // First call: mount data. Second call: PDF download
    api.get
      .mockResolvedValueOnce({ data: CERT_DATA })
      .mockResolvedValueOnce({ data: new Blob(['%PDF'], { type: 'application/pdf' }) })

    // Mock URL methods used by the download handler
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake')
    const mockRevokeObjectURL = vi.fn()
    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL

    // Mock anchor click
    const mockAnchorClick = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        const a = origCreate('a')
        a.click = mockAnchorClick
        return a
      }
      return origCreate(tag)
    })

    render(<CertPrint />)
    await waitFor(() => screen.getByText('cert_print.download_pdf'))
    fireEvent.click(screen.getByText('cert_print.download_pdf'))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/verify/cert_xyz/pdf', { responseType: 'blob' })
    })

    vi.restoreAllMocks()
  })
})
