/**
 * MetricsDashboard.test.jsx
 *
 * Covers:
 *  - Shows fetching placeholder before data arrives
 *  - Renders metrics.title heading
 *  - Shows polling status dot initially (wsLive = false)
 *  - Fetches GET /api/metrics/business on mount (native fetch)
 *  - Renders KPI values (users, companies, cert_rate_pct, revenue)
 *  - Shows metrics.updated prefix once data loads
 *  - Does not render KPIs when fetch returns non-ok response
 *  - WebSocket: connects to ws://localhost/ws/metrics
 *  - WebSocket: shows live indicator on onopen
 *  - WebSocket: updates metrics display on onmessage type=metrics
 *  - WebSocket: ignores messages with unknown type
 *  - WebSocket: reverts to polling indicator on onclose
 *
 * Timer notes:
 *   The component registers setInterval(10s) and setTimeout(15s) during its
 *   lifecycle. We do NOT use vi.useFakeTimers() because it also intercepts the
 *   setTimeout that @testing-library/react uses inside waitFor() to retry —
 *   causing every waitFor to time out immediately. Instead we call
 *   vi.clearAllTimers() in afterEach to discard any pending component timers.
 */
import { render, screen, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'

// ── module mock ───────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}))

import MetricsDashboard from '../components/MetricsDashboard'

// ── shared fixture ────────────────────────────────────────────────────────────

const METRICS = {
  users_total:         42,
  companies_total:     18,
  certified_total:     11,
  revenue_total_usd:   12400,
  cert_rate_pct:       61,
  avg_trust_score:     78,
  fraud_alerts_active: 0,
  requests_total:      1500,
  timestamp:           new Date().toISOString(),
}

// Helper: a fetch mock that resolves with data (or METRICS by default)
function okFetch(data = METRICS) {
  return vi.fn().mockResolvedValue({
    ok:   true,
    json: () => Promise.resolve(data),
  })
}

// ── WebSocket mock factory ────────────────────────────────────────────────────

function makeMockWS() {
  const instances = []
  class MockWS {
    constructor(url) {
      this.url = url
      instances.push(this)
    }
    // noop close prevents the onclose handler from triggering reconnect chains
    close() {}
  }
  return { MockWS, instances }
}

// ── Fetch-path tests ──────────────────────────────────────────────────────────

describe('MetricsDashboard — fetch', () => {
  let ws

  beforeEach(() => {
    ws = makeMockWS()
    vi.stubGlobal('WebSocket', ws.MockWS)
  })
  afterEach(() => {
    // Discard the component's 10-second poll interval and any other pending timers
    vi.clearAllTimers()
    vi.unstubAllGlobals()
  })

  it('shows fetching placeholder before data arrives', () => {
    global.fetch = () => new Promise(() => {}) // intentionally never resolves
    render(<MetricsDashboard />)
    expect(screen.getByText('metrics.fetching')).toBeInTheDocument()
  })

  it('renders metrics.title heading immediately', () => {
    global.fetch = () => new Promise(() => {})
    render(<MetricsDashboard />)
    expect(screen.getByText('metrics.title')).toBeInTheDocument()
  })

  it('shows polling status dot initially (wsLive = false)', () => {
    global.fetch = () => new Promise(() => {})
    render(<MetricsDashboard />)
    expect(screen.getByText('metrics.polling')).toBeInTheDocument()
  })

  it('calls GET /api/metrics/business on mount', async () => {
    global.fetch = okFetch()
    render(<MetricsDashboard />)
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/metrics/business'),
    )
  })

  it('renders users_total after fetch resolves', async () => {
    global.fetch = okFetch()
    render(<MetricsDashboard />)
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
  })

  it('renders companies_total after fetch resolves', async () => {
    global.fetch = okFetch()
    render(<MetricsDashboard />)
    await waitFor(() => expect(screen.getByText('18')).toBeInTheDocument())
  })

  it('renders cert_rate_pct as "61%" in the progress card', async () => {
    global.fetch = okFetch()
    render(<MetricsDashboard />)
    // The large text cert_rate_pct display in the Trust section is "{metrics.cert_rate_pct}%"
    await waitFor(() => {
      const matches = screen.getAllByText(/61%/)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders revenue as formatted currency', async () => {
    global.fetch = okFetch()
    render(<MetricsDashboard />)
    // KpiCard format="currency" → "$" + Math.round(12400).toLocaleString()
    await waitFor(() => {
      const matches = screen.getAllByText(/\$12[,.]?400/)
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows metrics.updated prefix once data is loaded', async () => {
    global.fetch = okFetch()
    render(<MetricsDashboard />)
    await waitFor(() =>
      expect(screen.getByText(/metrics\.updated/)).toBeInTheDocument(),
    )
  })

  it('keeps fetching placeholder when fetch returns non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<MetricsDashboard />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    // metrics stays null — fetching placeholder stays, no KPIs
    expect(screen.getByText('metrics.fetching')).toBeInTheDocument()
  })
})

// ── WebSocket-path tests ──────────────────────────────────────────────────────

describe('MetricsDashboard — WebSocket', () => {
  let ws

  beforeEach(() => {
    ws = makeMockWS()
    vi.stubGlobal('WebSocket', ws.MockWS)
    global.fetch = okFetch()
    // Make requestAnimationFrame complete animations instantly.
    // The useAnimatedValue hook animates over 800ms; passing now+1200 forces
    // elapsed > duration → progress = 1 → display = final value immediately.
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(performance.now() + 1200); return 0 })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.unstubAllGlobals()
  })

  it('creates a WebSocket connection to /ws/metrics on mount', async () => {
    render(<MetricsDashboard />)
    await waitFor(() => expect(ws.instances.length).toBeGreaterThan(0))
    expect(ws.instances[0].url).toMatch(/\/ws\/metrics/)
  })

  it('shows metrics.live indicator when WebSocket opens', async () => {
    render(<MetricsDashboard />)
    await waitFor(() => expect(ws.instances.length).toBeGreaterThan(0))
    act(() => { ws.instances[0].onopen?.() })
    await waitFor(() => expect(screen.getByText('metrics.live')).toBeInTheDocument())
  })

  it('updates display when WS delivers a metrics message', async () => {
    render(<MetricsDashboard />)
    await waitFor(() => expect(ws.instances.length).toBeGreaterThan(0))
    act(() => {
      ws.instances[0].onmessage?.({
        data: JSON.stringify({ type: 'metrics', data: { ...METRICS, users_total: 99 } }),
      })
    })
    await waitFor(() => {
      const els = screen.getAllByText('99')
      expect(els.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('ignores WS messages with unknown type', async () => {
    render(<MetricsDashboard />)
    // let the fetch settle so we have a baseline
    await waitFor(() => screen.getByText('42'))
    act(() => {
      ws.instances[0].onmessage?.({
        data: JSON.stringify({ type: 'ping', data: { users_total: 9999 } }),
      })
    })
    // users_total should remain 42
    expect(screen.queryByText('9999')).not.toBeInTheDocument()
    expect(screen.getAllByText('42').length).toBeGreaterThanOrEqual(1)
  })

  it('reverts to polling indicator when WebSocket closes', async () => {
    render(<MetricsDashboard />)
    await waitFor(() => expect(ws.instances.length).toBeGreaterThan(0))
    act(() => { ws.instances[0].onopen?.() })
    await waitFor(() => screen.getByText('metrics.live'))
    act(() => { ws.instances[0].onclose?.() })
    await waitFor(() => expect(screen.getByText('metrics.polling')).toBeInTheDocument())
  })
})
