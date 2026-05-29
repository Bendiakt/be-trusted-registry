/**
 * Unit tests for the Onboarding wizard.
 *
 * Covers:
 *   - Auth guard: redirects to /login when no session
 *   - Auth guard: redirects non-company roles to /dashboard
 *   - Step 1: renders profile form pre-filled from API
 *   - Step 1: validation — company name required
 *   - Step 1: saves profile via PATCH and advances to step 2
 *   - Step 1: shows API error on patch failure
 *   - Step 1: "Skip for now" calls finish (localStorage + /dashboard)
 *   - Step 2: displays document checklist and navigation buttons
 *   - Step 2: Back returns to step 1, Continue advances to step 3
 *   - Step 3: displays level cards
 *   - Step 3: selecting a level updates CTA button label
 *   - Step 3: Back returns to step 2
 *   - Step 3: "Go to Dashboard" sets localStorage and navigates
 *   - Global skip link sets localStorage and navigates
 *   - Progress bar reflects current step
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// ── Stubs ─────────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }) => <a href={to} {...rest}>{children}</a>,
}))

const OB_T = {
  'onboarding.step1_eyebrow': 'Step 1 of 3',
  'onboarding.step1_heading': 'Set up your company profile',
  'onboarding.step1_sub': 'This information will appear on your public registry listing and certification documents.',
  'onboarding.step2_eyebrow': 'Step 2 of 3',
  'onboarding.step2_heading': 'Prepare your documents',
  'onboarding.step2_sub': "You'll upload these in your Dashboard.",
  'onboarding.step3_eyebrow': 'Step 3 of 3',
  'onboarding.step3_heading': 'Choose your certification level',
  'onboarding.step3_sub': 'You can change this later.',
  'onboarding.profile_label': 'Profile',
  'onboarding.documents_label': 'Documents',
  'onboarding.level_label': 'Level',
  'onboarding.skip': 'Skip for now',
  'onboarding.skip_bottom': 'Skip setup and go directly to Dashboard →',
  'onboarding.back': '← Back',
  'onboarding.continue': 'Continue →',
  'onboarding.saving': 'Saving…',
  'onboarding.error_name_required': 'Company name is required.',
  'onboarding.error_save_failed': 'Could not save profile. Please try again.',
  'onboarding.label_name': 'Company name *',
  'onboarding.label_sector': 'Sector',
  'onboarding.label_country': 'Country',
  'onboarding.label_website': 'Website (optional)',
  'onboarding.placeholder_name': 'e.g. Acme Trading LLC',
  'onboarding.placeholder_sector': 'Select sector',
  'onboarding.placeholder_country': 'Select country',
  'onboarding.placeholder_website': 'https://yourcompany.com',
  'onboarding.docs_upload_title': '📁 Where to upload?',
  'onboarding.docs_upload_body': 'After completing setup, go to Dashboard → Documents to upload and submit your files.',
  'onboarding.most_popular': 'Most popular',
  'onboarding.payment_title': '💳 Payment later',
  'onboarding.payment_body': "You won't be charged now.",
  'onboarding.finish_with_level': 'Start with {{level}} →',
  'onboarding.go_to_dashboard': 'Go to Dashboard →',
}

const mockT = (key, opts) => {
  let str = OB_T[key] ?? key
  if (opts && typeof str === 'string') {
    Object.entries(opts).forEach(([k, v]) => {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
    })
  }
  return str
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}))

vi.mock('../lib/api', () => ({
  default: {
    get:   vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../lib/session', () => ({
  getSession: vi.fn(),
}))

import Onboarding from '../pages/Onboarding'
import api from '../lib/api'
import { getSession } from '../lib/session'

// ── Helpers ───────────────────────────────────────────────────────────────────
const COMPANY_USER = { id: 1, role: 'company', name: 'Alice Corp' }
const EMPTY_PROFILE = { data: { company: { companyName: '', sector: '', country: '', website: '' } } }

function setup(user = COMPANY_USER) {
  getSession.mockReturnValue(user)
  api.get.mockResolvedValue(EMPTY_PROFILE)
  return render(<Onboarding />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('Onboarding — auth guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects to /login when no session', async () => {
    getSession.mockReturnValue(null)
    api.get.mockResolvedValue(EMPTY_PROFILE)
    render(<Onboarding />)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('redirects non-company user to /dashboard', async () => {
    getSession.mockReturnValue({ id: 2, role: 'admin', name: 'Admin' })
    api.get.mockResolvedValue(EMPTY_PROFILE)
    render(<Onboarding />)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('Onboarding — Step 1: Profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders step 1 heading', async () => {
    setup()
    await waitFor(() => {
      expect(screen.getByText(/set up your company profile/i)).toBeInTheDocument()
    })
  })

  it('pre-fills name from session user', async () => {
    setup()
    await waitFor(() => {
      const nameInput = document.querySelector('#ob-name')
      expect(nameInput).toBeInTheDocument()
      expect(nameInput.value).toBe('Alice Corp')
    })
  })

  it('pre-fills fields from API response', async () => {
    getSession.mockReturnValue(COMPANY_USER)
    api.get.mockResolvedValue({
      data: { company: { companyName: 'Test Co', sector: 'Logistics', country: 'FR', website: 'https://test.co' } },
    })
    render(<Onboarding />)
    await waitFor(() => {
      expect(document.querySelector('#ob-name').value).toBe('Test Co')
      expect(document.querySelector('#ob-sector').value).toBe('Logistics')
      expect(document.querySelector('#ob-country').value).toBe('FR')
      expect(document.querySelector('#ob-website').value).toBe('https://test.co')
    })
  })

  it('shows validation error when company name is empty', async () => {
    setup()
    await waitFor(() => expect(document.querySelector('#ob-name')).toBeInTheDocument())

    // Clear name and click Continue
    fireEvent.change(document.querySelector('#ob-name'), { target: { value: '' } })
    fireEvent.click(screen.getByText(/continue →/i))

    expect(screen.getByText(/company name is required/i)).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('calls PATCH /api/companies/me and advances to step 2 on success', async () => {
    setup()
    await waitFor(() => expect(document.querySelector('#ob-name')).toBeInTheDocument())

    fireEvent.change(document.querySelector('#ob-name'), { target: { value: 'New Corp' } })
    api.patch.mockResolvedValueOnce({ data: {} })
    fireEvent.click(screen.getByText(/continue →/i))

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/api/companies/me', expect.objectContaining({
        companyName: 'New Corp',
      }))
      expect(screen.getByText(/prepare your documents/i)).toBeInTheDocument()
    })
  })

  it('shows error when PATCH fails', async () => {
    setup()
    await waitFor(() => expect(document.querySelector('#ob-name')).toBeInTheDocument())

    fireEvent.change(document.querySelector('#ob-name'), { target: { value: 'Corp X' } })
    api.patch.mockRejectedValueOnce(new Error('Network error'))
    fireEvent.click(screen.getByText(/continue →/i))

    await waitFor(() => {
      expect(screen.getByText(/could not save profile/i)).toBeInTheDocument()
    })
  })

  it('"Skip for now" sets localStorage and navigates to /dashboard', async () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'setItem')
    setup()
    await waitFor(() => expect(screen.getByText(/skip for now/i)).toBeInTheDocument())

    fireEvent.click(screen.getByText(/skip for now/i))

    expect(lsSpy).toHaveBeenCalledWith('mydd_onboarding_done', '1')
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    lsSpy.mockRestore()
  })
})

describe('Onboarding — Step 2: Documents', () => {
  beforeEach(() => vi.clearAllMocks())

  async function advanceToStep2() {
    setup()
    await waitFor(() => expect(document.querySelector('#ob-name')).toBeInTheDocument())
    fireEvent.change(document.querySelector('#ob-name'), { target: { value: 'Corp' } })
    api.patch.mockResolvedValueOnce({ data: {} })
    fireEvent.click(screen.getByText(/continue →/i))
    await waitFor(() => expect(screen.getByText(/prepare your documents/i)).toBeInTheDocument())
  }

  it('displays document checklist items', async () => {
    await advanceToStep2()
    expect(screen.getByText(/certificate of incorporation/i)).toBeInTheDocument()
    expect(screen.getByText(/identity documents/i)).toBeInTheDocument()
  })

  it('Back returns to step 1', async () => {
    await advanceToStep2()
    fireEvent.click(screen.getByText(/← back/i))
    await waitFor(() => expect(screen.getByText(/set up your company profile/i)).toBeInTheDocument())
  })

  it('Continue advances to step 3', async () => {
    await advanceToStep2()
    // Step 2 has its own Continue button
    const continueBtn = screen.getByRole('button', { name: /continue →/i })
    fireEvent.click(continueBtn)
    await waitFor(() => expect(screen.getByText(/choose your certification level/i)).toBeInTheDocument())
  })
})

describe('Onboarding — Step 3: Level', () => {
  beforeEach(() => vi.clearAllMocks())

  async function advanceToStep3() {
    setup()
    await waitFor(() => expect(document.querySelector('#ob-name')).toBeInTheDocument())
    fireEvent.change(document.querySelector('#ob-name'), { target: { value: 'Corp' } })
    api.patch.mockResolvedValueOnce({ data: {} })
    fireEvent.click(screen.getByText(/continue →/i))
    await waitFor(() => expect(screen.getByText(/prepare your documents/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /continue →/i }))
    await waitFor(() => expect(screen.getByText(/choose your certification level/i)).toBeInTheDocument())
  }

  it('displays all three level cards', async () => {
    await advanceToStep3()
    expect(screen.getByText(/Bronze · Level 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Silver · Level 2/i)).toBeInTheDocument()
    expect(screen.getByText(/Gold · Level 3/i)).toBeInTheDocument()
  })

  it('Silver card is marked "Most popular"', async () => {
    await advanceToStep3()
    expect(screen.getByText(/most popular/i)).toBeInTheDocument()
  })

  it('selecting a level updates the CTA button label', async () => {
    await advanceToStep3()
    // Before selection
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument()

    // Click Bronze
    fireEvent.click(screen.getByText(/Bronze · Level 1/i))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start with Bronze/i })).toBeInTheDocument()
    })
  })

  it('Back returns to step 2', async () => {
    await advanceToStep3()
    fireEvent.click(screen.getByRole('button', { name: /← back/i }))
    await waitFor(() => expect(screen.getByText(/prepare your documents/i)).toBeInTheDocument())
  })

  it('finishing sets localStorage and navigates to /dashboard', async () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'setItem')
    await advanceToStep3()

    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }))

    expect(lsSpy).toHaveBeenCalledWith('mydd_onboarding_done', '1')
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    lsSpy.mockRestore()
  })
})

describe('Onboarding — global skip link', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skip setup link at bottom sets localStorage and navigates', async () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'setItem')
    setup()
    await waitFor(() => expect(screen.getByText(/skip setup and go directly to dashboard/i)).toBeInTheDocument())

    fireEvent.click(screen.getByText(/skip setup and go directly to dashboard/i))

    expect(lsSpy).toHaveBeenCalledWith('mydd_onboarding_done', '1')
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    lsSpy.mockRestore()
  })
})

describe('Onboarding — progress bar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('step labels are visible: Profile, Documents, Level', async () => {
    setup()
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument()
      expect(screen.getByText('Documents')).toBeInTheDocument()
      expect(screen.getByText('Level')).toBeInTheDocument()
    })
  })
})
