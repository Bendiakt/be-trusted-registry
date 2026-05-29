/**
 * PACSupervisionDashboard.test.jsx
 *
 * Covers the three rendering modes:
 *  S1 tier  — "supervision not available" placeholder
 *  S2 tier  — S2Dashboard: KPIs, task checklist, team list, simulator,
 *             supervise form, MonthlyReportModal, bonus history
 *  S3 tier  — S3Dashboard: KPIs, org tree (S2 → S1 expand), task checklist
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

// useMobile: return false (desktop) by default so grids render all columns
vi.mock('../lib/useMobile', () => ({
  useMobile: () => false,
}))

import PACSupervisionDashboard from '../components/PACSupervisionDashboard'
import api from '../lib/api'

// ── shared fixtures ───────────────────────────────────────────────────────────

const TEAM = {
  team: [
    {
      supervision_id: 1, full_name: 'Alice Martin', email: 'alice@pac.com',
      supervision_status: 'active', location: 'Paris',
      missions_completed_month: 4, gross_revenue_cents_month: 200000, missions_total: 42,
    },
  ],
  preview: {
    month: '2026-05', gross_revenue_cents: 200000, commissions_cents: 20000,
    net_be_cents: 180000, estimated_bonus_cents: 9000,
  },
}

const TASKS = {
  tasks: [
    { id: 1, task_type: 'weekly_checkin', completed: true,  notes: null },
    { id: 2, task_type: 'monthly_supervision_report', completed: false, notes: null },
  ],
  task_templates: ['weekly_checkin', 'monthly_supervision_report'],
  summary: { completion_pct: 50 },
}

const BONUS = {
  total_paid_usd: '125.00',
  history: [
    { id: 10, period_year: 2026, period_month: 4, bonus_level: 'S2',
      final_bonus_cents: 9500, status: 'paid' },
  ],
}

const SIM = {
  inputs: { missions_per_agent_month: 3, avg_fee_usd: 500 },
  monthly: { estimated_bonus_usd: '225.00' },
  annual:  { estimated_bonus_usd: '2700.00' },
}

const ORG = {
  total_s2s: 2, total_s1s: 5,
  estimated_bonus_l1_cents: 5000,
  estimated_bonus_l2_cents: 3000,
  s2s: [
    {
      id: 20, full_name: 'Marc Dupont', email: 'marc@pac.com',
      supervision_status: 'active', location: 'Lyon',
      s1s: [
        { id: 30, full_name: 'Lucie Renard', email: 'lucie@pac.com', location: 'Nice', missions_total: 8 },
      ],
    },
  ],
}

// Helper — resolve all api.get calls with the S2 fixture set
function mockS2Apis () {
  api.get.mockImplementation((url) => {
    if (url.includes('/team'))      return Promise.resolve({ data: TEAM })
    if (url.includes('/tasks'))     return Promise.resolve({ data: TASKS })
    if (url.includes('/bonus'))     return Promise.resolve({ data: BONUS })
    if (url.includes('/simulator')) return Promise.resolve({ data: SIM })
    return Promise.resolve({ data: {} })
  })
}

// Helper — resolve all api.get calls with the S3 fixture set
function mockS3Apis () {
  api.get.mockImplementation((url) => {
    if (url.includes('/org'))   return Promise.resolve({ data: ORG })
    if (url.includes('/tasks')) return Promise.resolve({ data: TASKS })
    if (url.includes('/bonus')) return Promise.resolve({ data: BONUS })
    return Promise.resolve({ data: {} })
  })
}

// ── S1 tier ───────────────────────────────────────────────────────────────────

describe('PACSupervisionDashboard — S1 (no supervision)', () => {
  test('shows "disponible à partir du niveau S2" message for S1 tier', () => {
    render(<PACSupervisionDashboard pacTier="S1" />)
    expect(screen.getByText(/disponible à partir du niveau S2/i)).toBeInTheDocument()
  })

  test('shows upgrade hint for unknown tier', () => {
    render(<PACSupervisionDashboard pacTier={null} />)
    expect(screen.getByText(/disponible à partir du niveau S2/i)).toBeInTheDocument()
  })
})

// ── S2 Dashboard ──────────────────────────────────────────────────────────────

describe('PACSupervisionDashboard — S2Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockS2Apis()
  })

  test('shows loading spinner then renders KPI cards', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    // Loading state
    expect(screen.getByText(/chargement/i)).toBeInTheDocument()
    // KPI: S1 actifs
    await waitFor(() => expect(screen.getByText('S1 actifs')).toBeInTheDocument())
    // KPI: bonus estimé (label)
    expect(screen.getByText('Bonus estimé ce mois')).toBeInTheDocument()
    // KPI: total reçu
    expect(screen.getByText('Total reçu (historique)')).toBeInTheDocument()
  })

  test('fetches team, tasks, bonus, and simulator on mount', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/pac/supervision/team'))
    expect(api.get).toHaveBeenCalledWith('/api/pac/supervision/tasks')
    expect(api.get).toHaveBeenCalledWith('/api/pac/supervision/bonus')
    expect(api.get).toHaveBeenCalledWith('/api/pac/supervision/simulator')
  })

  test('renders team agent name and status', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText('Alice Martin')).toBeInTheDocument())
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  test('renders task checklist with correct labels', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText('Check-in individuel S1')).toBeInTheDocument())
    expect(screen.getByText('Rapport de supervision mensuel')).toBeInTheDocument()
  })

  test('completed task shows strikethrough indicator (✓)', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText('Check-in individuel S1')).toBeInTheDocument())
    // The ✓ icon is rendered next to completed tasks
    const checkmarks = screen.getAllByText('✓')
    expect(checkmarks.length).toBeGreaterThanOrEqual(1)
  })

  test('BonusBar shows correct completion percentage', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText(/50%/i)).toBeInTheDocument())
  })

  test('renders simulator section with revenue figures', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText('Simulateur de revenus')).toBeInTheDocument())
    expect(screen.getByText('$225.00')).toBeInTheDocument()
    expect(screen.getByText('$2700.00')).toBeInTheDocument()
  })

  test('bonus history row renders amount and status pill', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText('Historique des bonus')).toBeInTheDocument())
    expect(screen.getByText('paid')).toBeInTheDocument()
  })

  test('"Marquer fait" button calls POST for a simple task', async () => {
    api.post.mockResolvedValue({ data: {} })
    render(<PACSupervisionDashboard pacTier="S2" />)
    // weekly_checkin is already done in fixtures — add an incomplete simple task
    const tasksWithPending = {
      ...TASKS,
      task_templates: ['weekly_checkin', 'weekly_spot_check', 'monthly_supervision_report'],
      tasks: [{ id: 1, task_type: 'weekly_checkin', completed: true, notes: null }],
    }
    api.get.mockImplementation((url) => {
      if (url.includes('/team'))      return Promise.resolve({ data: TEAM })
      if (url.includes('/tasks'))     return Promise.resolve({ data: tasksWithPending })
      if (url.includes('/bonus'))     return Promise.resolve({ data: BONUS })
      if (url.includes('/simulator')) return Promise.resolve({ data: SIM })
      return Promise.resolve({ data: {} })
    })
    const { rerender } = render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText('Audit spot-check S1')).toBeInTheDocument())
    const markBtn = screen.getByRole('button', { name: /marquer fait/i })
    fireEvent.click(markBtn)
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/pac/supervision/tasks/weekly_spot_check',
        expect.objectContaining({}),
      ),
    )
  })

  test('monthly report task opens MonthlyReportModal', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByText('Rapport de supervision mensuel')).toBeInTheDocument())
    const reportBtn = screen.getByRole('button', { name: /rédiger le rapport/i })
    fireEvent.click(reportBtn)
    expect(screen.getByText('Rapport de Supervision Mensuel')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/réalisations clés/i)).toBeInTheDocument()
  })

  test('MonthlyReportModal shows error if accomplishments is empty', async () => {
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /rédiger le rapport/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /rédiger le rapport/i }))
    // Click submit without filling accomplishments
    fireEvent.click(screen.getByRole('button', { name: /soumettre le rapport/i }))
    expect(screen.getByText(/réalisations sont requises/i)).toBeInTheDocument()
  })

  test('MonthlyReportModal submits and calls POST when accomplishments filled', async () => {
    api.post.mockResolvedValue({ data: {} })
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /rédiger le rapport/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /rédiger le rapport/i }))
    fireEvent.change(screen.getByPlaceholderText(/réalisations clés/i), { target: { value: 'Excellent mois' } })
    fireEvent.click(screen.getByRole('button', { name: /soumettre le rapport/i }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/pac/supervision/tasks/monthly_supervision_report',
        expect.objectContaining({ notes: expect.stringContaining('Excellent mois') }),
      ),
    )
  })

  test('supervise form submits user ID and shows success message', async () => {
    api.post.mockResolvedValue({ data: {} })
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByPlaceholderText(/User ID du S1/i)).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/User ID du S1/i), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer demande/i }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/pac/supervise', { supervised_user_id: 42 }),
    )
    expect(await screen.findByText(/demande envoyée/i)).toBeInTheDocument()
  })

  test('supervise form shows error message on API failure', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'User not found' } } })
    render(<PACSupervisionDashboard pacTier="S2" />)
    await waitFor(() => expect(screen.getByPlaceholderText(/User ID du S1/i)).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/User ID du S1/i), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer demande/i }))
    expect(await screen.findByText(/User not found/i)).toBeInTheDocument()
  })
})

// ── S3 Dashboard ──────────────────────────────────────────────────────────────

describe('PACSupervisionDashboard — S3Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockS3Apis()
  })

  test('shows loading spinner then renders S3 KPI cards', async () => {
    render(<PACSupervisionDashboard pacTier="S3" />)
    expect(screen.getByText(/chargement/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Organisation')).toBeInTheDocument())
    expect(screen.getByText('Bonus estimé ce mois (L1+L2)')).toBeInTheDocument()
  })

  test('fetches org, tasks, and bonus on mount', async () => {
    render(<PACSupervisionDashboard pacTier="S3" />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/pac/supervision/org'))
    expect(api.get).toHaveBeenCalledWith('/api/pac/supervision/tasks')
    expect(api.get).toHaveBeenCalledWith('/api/pac/supervision/bonus')
  })

  test('org tree shows S2 agent name and S1 count', async () => {
    render(<PACSupervisionDashboard pacTier="S3" />)
    await waitFor(() => expect(screen.getByText('Marc Dupont')).toBeInTheDocument())
    expect(screen.getByText(/1 S1/i)).toBeInTheDocument()
  })

  test('clicking S2 row expands S1 agents', async () => {
    render(<PACSupervisionDashboard pacTier="S3" />)
    await waitFor(() => expect(screen.getByText('Marc Dupont')).toBeInTheDocument())
    // S1 agent not yet visible
    expect(screen.queryByText('Lucie Renard')).not.toBeInTheDocument()
    // Click the S2 row to expand
    fireEvent.click(screen.getByText('Marc Dupont').closest('div[style]'))
    expect(screen.getByText('Lucie Renard')).toBeInTheDocument()
    expect(screen.getByText('8 missions')).toBeInTheDocument()
  })

  test('task checklist renders with completion percentage', async () => {
    render(<PACSupervisionDashboard pacTier="S3" />)
    await waitFor(() => expect(screen.getByText('Check-in individuel S1')).toBeInTheDocument())
    expect(screen.getByText(/50%/i)).toBeInTheDocument()
  })

  test('total org counts are displayed correctly', async () => {
    render(<PACSupervisionDashboard pacTier="S3" />)
    await waitFor(() => expect(screen.getByText('Organisation')).toBeInTheDocument())
    // "2 S2 · 5 S1" — numbers are rendered inline with text nodes
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  test('S3 bonus history renders with paid status', async () => {
    render(<PACSupervisionDashboard pacTier="S3" />)
    await waitFor(() => expect(screen.getByText('Historique des bonus')).toBeInTheDocument())
    expect(screen.getByText('paid')).toBeInTheDocument()
    expect(screen.getByText(/Niveau S2/i)).toBeInTheDocument()
  })
})
