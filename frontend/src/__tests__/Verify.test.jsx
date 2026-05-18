/**
 * Tests for Verify page (public supplier verification).
 *
 * The page calls GET /api/verify/:id on mount using the :id URL param.
 * Three states: loading, success (company data shown), error.
 *
 * Covers:
 *  - Calls GET /api/verify/:id with the param from the URL
 *  - Shows company name and certification level on success
 *  - Shows error message when API rejects
 *  - Shows loading state while API is in-flight
 */
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-router-dom', () => ({
  useParams:   () => ({ id: 'company_abc' }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

import Verify from '../pages/Verify'
import api from '../lib/api'

const COMPANY_DATA = {
  companyName: 'Acme Corp',
  sector:      'Manufacturing',
  country:     'UAE',
  level:       2,
  status:      'active',
  badge:       'Level 2 — KYC Validated',
  website:     'https://acme.example.com',
}

describe('Verify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls GET /api/verify/:id with the id from URL params', async () => {
    api.get.mockResolvedValueOnce({ data: COMPANY_DATA })
    render(<Verify />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/verify/company_abc')
    })
  })

  it('shows company name after API resolves', async () => {
    api.get.mockResolvedValueOnce({ data: COMPANY_DATA })
    render(<Verify />)
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
  })

  it('shows sector and country after API resolves', async () => {
    api.get.mockResolvedValueOnce({ data: COMPANY_DATA })
    render(<Verify />)
    await waitFor(() => {
      expect(screen.getByText('Manufacturing — UAE')).toBeInTheDocument()
    })
  })

  it('shows certification level indicator', async () => {
    api.get.mockResolvedValueOnce({ data: COMPANY_DATA })
    render(<Verify />)
    await waitFor(() => {
      // Level 2/3 rendered as "2 / 3"
      expect(screen.getByText('2 / 3')).toBeInTheDocument()
    })
  })

  it('shows error message when API rejects', async () => {
    api.get.mockRejectedValueOnce(new Error('not found'))
    render(<Verify />)
    await waitFor(() => {
      expect(screen.getByText('verify.not_found')).toBeInTheDocument()
    })
  })

  it('shows loading indicator while API is in-flight', () => {
    // Never resolve — stays in loading state
    api.get.mockReturnValueOnce(new Promise(() => {}))
    render(<Verify />)
    expect(screen.getByText('verify.verifying')).toBeInTheDocument()
  })

  it('renders website link when company has a website', async () => {
    api.get.mockResolvedValueOnce({ data: COMPANY_DATA })
    render(<Verify />)
    await waitFor(() => {
      expect(document.querySelector('a[href="https://acme.example.com"]')).toBeInTheDocument()
    })
  })

  it('does not render website link when company has no website', async () => {
    const noWebsite = { ...COMPANY_DATA, website: null }
    api.get.mockResolvedValueOnce({ data: noWebsite })
    render(<Verify />)
    await waitFor(() => {
      // Company name is present → data rendered
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
    expect(document.querySelector('a[href*="acme.example.com"]')).not.toBeInTheDocument()
  })
})
