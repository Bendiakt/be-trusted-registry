/**
 * Tests for MissionReport page.
 *
 * The page calls GET /api/pac/missions/:id on mount.
 * Three states: loading (Skeleton), error, success (report rendered).
 *
 * Covers:
 *  - Calls correct API endpoint with :id from useParams
 *  - Shows loading skeleton while in-flight
 *  - Shows error message + back-to-portal button on failure
 *  - Renders company name on success
 *  - Renders mission outcome badge (PASS / FAIL / CONDITIONAL)
 *  - Renders mission ID in footer
 *  - Back button navigates to /pac
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useParams:   () => ({ id: '42' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}))

vi.mock('../lib/api', () => ({
  default: { get: vi.fn() },
}))

vi.mock('../components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}))

import MissionReport from '../pages/MissionReport'
import api from '../lib/api'

const MISSION = {
  id:            42,
  company_name:  'Acme Corp',
  company_id:    7,
  outcome:       'pass',
  status:        'completed',
  type:          'site_inspection',
  location:      'Dubai, UAE',
  reportText:    'All systems nominal.',
  description:   'Routine inspection.',
  pacAgentName:  'Jane Inspector',
  pacLocation:   'Dubai',
  completedAt:   '2026-01-15T10:00:00Z',
  fee:           500,
  assigned_to:   3,
}

describe('MissionReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls GET /api/pac/missions/42', async () => {
    api.get.mockResolvedValueOnce({ data: MISSION })
    render(<MissionReport />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/pac/missions/42')
    })
  })

  it('shows loading skeleton while API is in-flight', () => {
    api.get.mockReturnValueOnce(new Promise(() => {}))
    render(<MissionReport />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
  })

  it('shows error message when API rejects', async () => {
    api.get.mockRejectedValueOnce(new Error('forbidden'))
    render(<MissionReport />)
    await waitFor(() => {
      expect(screen.getByText('Mission not found or access denied.')).toBeInTheDocument()
    })
  })

  it('back-to-portal button navigates to /pac on error', async () => {
    api.get.mockRejectedValueOnce(new Error('forbidden'))
    render(<MissionReport />)
    await waitFor(() => screen.getByText('← Back to Portal'))
    fireEvent.click(screen.getByText('← Back to Portal'))
    expect(mockNavigate).toHaveBeenCalledWith('/pac')
  })

  it('renders company name on success', async () => {
    api.get.mockResolvedValueOnce({ data: MISSION })
    render(<MissionReport />)
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })
  })

  it('renders PASS outcome badge', async () => {
    api.get.mockResolvedValueOnce({ data: MISSION })
    render(<MissionReport />)
    await waitFor(() => {
      expect(screen.getByText('PASS')).toBeInTheDocument()
    })
  })

  it('renders FAIL outcome badge', async () => {
    api.get.mockResolvedValueOnce({ data: { ...MISSION, outcome: 'fail' } })
    render(<MissionReport />)
    await waitFor(() => {
      expect(screen.getByText('FAIL')).toBeInTheDocument()
    })
  })

  it('renders CONDITIONAL outcome badge', async () => {
    api.get.mockResolvedValueOnce({ data: { ...MISSION, outcome: 'conditional' } })
    render(<MissionReport />)
    await waitFor(() => {
      expect(screen.getByText('CONDITIONAL')).toBeInTheDocument()
    })
  })

  it('renders the mission ID padded in the report footer', async () => {
    api.get.mockResolvedValueOnce({ data: MISSION })
    render(<MissionReport />)
    await waitFor(() => {
      // Footer shows "REPORT-000042 · Confidential"
      expect(screen.getByText(/REPORT-000042/)).toBeInTheDocument()
    })
  })

  it('renders audit findings when reportText is present', async () => {
    api.get.mockResolvedValueOnce({ data: MISSION })
    render(<MissionReport />)
    await waitFor(() => {
      expect(screen.getByText('All systems nominal.')).toBeInTheDocument()
    })
  })

  it('back toolbar button navigates to /pac on success', async () => {
    api.get.mockResolvedValueOnce({ data: MISSION })
    render(<MissionReport />)
    await waitFor(() => screen.getByText('Acme Corp'))
    // The back button is the first button in the toolbar
    fireEvent.click(document.querySelector('.no-print button'))
    expect(mockNavigate).toHaveBeenCalledWith('/pac')
  })
})
