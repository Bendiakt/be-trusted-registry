import { useState, useEffect, useRef, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Animated number counter hook (requestAnimationFrame, 800ms ease-out)
// ---------------------------------------------------------------------------
const useAnimatedValue = (target, duration = 800) => {
  const [display, setDisplay] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef(null)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    if (from === to) return

    const startTime = performance.now()
    const tick = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + (to - from) * eased
      setDisplay(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

// ---------------------------------------------------------------------------
// Individual KPI card
// ---------------------------------------------------------------------------
const KpiCard = ({ label, value, format = 'int', color = '#C9A84C', subtitle, delta }) => {
  const animated = useAnimatedValue(
    typeof value === 'number' ? value : parseFloat(value) || 0,
  )

  const formatted = (() => {
    if (format === 'currency') return '$' + Math.round(animated).toLocaleString()
    if (format === 'percent') return Math.round(animated) + '%'
    if (format === 'decimal') return animated.toFixed(1)
    return Math.round(animated).toLocaleString()
  })()

  const deltaColor = delta > 0 ? '#4CAF50' : delta < 0 ? '#e74c3c' : '#666'
  const deltaIcon = delta > 0 ? '▲' : delta < 0 ? '▼' : '—'

  return (
    <div style={{
      background: '#1a1a1a',
      border: '1px solid #2a2a2a',
      borderRadius: '12px',
      padding: '1.25rem 1.5rem',
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.3s',
    }}>
      {/* accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
        background: `linear-gradient(90deg, ${color}, transparent)`,
      }} />
      <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
        {label}
      </div>
      <div style={{ color: color, fontSize: '2rem', fontWeight: '900', lineHeight: 1, marginBottom: '0.3rem', fontVariantNumeric: 'tabular-nums' }}>
        {formatted}
      </div>
      {subtitle && (
        <div style={{ color: '#555', fontSize: '0.75rem' }}>{subtitle}</div>
      )}
      {delta !== undefined && (
        <div style={{ color: deltaColor, fontSize: '0.7rem', marginTop: '0.25rem', fontWeight: '600' }}>
          {deltaIcon} {Math.abs(delta)} vs. last snapshot
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trust score gauge (0-100)
// ---------------------------------------------------------------------------
const TrustGauge = ({ score }) => {
  const animated = useAnimatedValue(score || 0)
  const pct = Math.min(Math.max(animated, 0), 100)
  const color = pct >= 70 ? '#4CAF50' : pct >= 40 ? '#f39c12' : '#e74c3c'
  const label = pct >= 70 ? 'LOW RISK' : pct >= 40 ? 'MEDIUM RISK' : 'HIGH RISK'

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="120" height="70" viewBox="0 0 120 70" style={{ overflow: 'visible' }}>
        {/* Background arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none" stroke="#2a2a2a" strokeWidth="10" strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d="M 10 60 A 50 50 0 0 1 110 60"
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 157} 157`}
          style={{ transition: 'stroke-dasharray 0.8s ease-out, stroke 0.4s' }}
        />
        <text x="60" y="58" textAnchor="middle" fill={color} fontSize="18" fontWeight="900" fontFamily="sans-serif">
          {Math.round(pct)}
        </text>
        <text x="60" y="72" textAnchor="middle" fill="#555" fontSize="8" fontFamily="sans-serif" letterSpacing="1">
          {label}
        </text>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fraud alerts badge
// ---------------------------------------------------------------------------
const AlertsBadge = ({ count }) => {
  const color = count === 0 ? '#4CAF50' : count < 5 ? '#f39c12' : '#e74c3c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{
        width: '10px', height: '10px', borderRadius: '50%',
        background: color,
        boxShadow: count > 0 ? `0 0 8px ${color}` : 'none',
        animation: count > 0 ? 'pulse 2s infinite' : 'none',
      }} />
      <span style={{ color, fontWeight: '700', fontSize: '0.8rem' }}>
        {count === 0 ? 'CLEAR' : `${count} ACTIVE`}
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Connection status indicator
// ---------------------------------------------------------------------------
const StatusDot = ({ live }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
    <div style={{
      width: '7px', height: '7px', borderRadius: '50%',
      background: live ? '#4CAF50' : '#555',
      boxShadow: live ? '0 0 6px #4CAF50' : 'none',
      animation: live ? 'pulse 2.5s infinite' : 'none',
    }} />
    <span style={{ color: '#555', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
      {live ? 'LIVE' : 'POLLING'}
    </span>
  </div>
)

// ---------------------------------------------------------------------------
// Main MetricsDashboard component
// ---------------------------------------------------------------------------
export default function MetricsDashboard() {
  const [metrics, setMetrics] = useState(null)
  const [wsLive, setWsLive] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const wsRef = useRef(null)
  const pollRef = useRef(null)

  const applyMetrics = useCallback((data) => {
    setMetrics(data)
    setLastUpdated(new Date())
  }, [])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics/business')
      if (!res.ok) return
      const data = await res.json()
      applyMetrics(data)
    } catch { /* silent */ }
  }, [applyMetrics])

  const startPolling = useCallback(() => {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(fetchMetrics, 10_000)
    fetchMetrics() // immediate first fetch
  }, [fetchMetrics])

  const connectWs = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/metrics`

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setWsLive(true)
        clearInterval(pollRef.current)
      }

      ws.onmessage = (evt) => {
        try {
          const { type, data } = JSON.parse(evt.data)
          if (type === 'metrics') applyMetrics(data)
        } catch { /* invalid frame */ }
      }

      ws.onclose = () => {
        setWsLive(false)
        wsRef.current = null
        // Fall back to polling, retry WS after 15 s
        startPolling()
        setTimeout(connectWs, 15_000)
      }

      ws.onerror = () => ws.close()
    } catch {
      // WebSocket not available — just poll
      startPolling()
    }
  }, [applyMetrics, startPolling])

  useEffect(() => {
    fetchMetrics() // immediate load before WS connects
    connectWs()
    return () => {
      clearInterval(pollRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const G = {
    section: { marginBottom: '1.5rem' },
    sectionTitle: { color: '#444', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.75rem', borderBottom: '1px solid #222', paddingBottom: '0.4rem' },
    grid: { display: 'grid', gap: '1rem' },
  }

  const prev = metrics?.prev_snapshot

  const delta = (key, curKey) => {
    if (!prev || metrics[curKey] === undefined) return undefined
    return metrics[curKey] - (prev[key] || 0)
  }

  return (
    <div style={{ fontFamily: 'sans-serif', color: '#eee' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#eee' }}>Business Metrics</div>
          <div style={{ color: '#444', fontSize: '0.75rem', marginTop: '0.15rem' }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
          </div>
        </div>
        <StatusDot live={wsLive} />
      </div>

      {!metrics && (
        <div style={{ color: '#444', fontSize: '0.875rem', padding: '2rem', textAlign: 'center' }}>
          Fetching data from database…
        </div>
      )}

      {metrics && (
        <>
          {/* KPI grid — top row */}
          <div style={{ ...G.section }}>
            <div style={{ ...G.sectionTitle }}>Registry Overview</div>
            <div style={{ ...G.grid, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <KpiCard
                label="Total Users"
                value={metrics.users_total}
                color="#C9A84C"
                delta={delta('users_count', 'users_total')}
              />
              <KpiCard
                label="Companies"
                value={metrics.companies_total}
                color="#4a90e2"
                delta={delta('companies_count', 'companies_total')}
              />
              <KpiCard
                label="Certified"
                value={metrics.certified_total}
                color="#4CAF50"
                subtitle={`${metrics.cert_rate_pct}% certification rate`}
                delta={delta('certified_count', 'certified_total')}
              />
              <KpiCard
                label="Revenue"
                value={metrics.revenue_total_usd}
                format="currency"
                color="#C9A84C"
                delta={prev ? metrics.revenue_total_usd - parseFloat(prev.revenue_total || 0) : undefined}
              />
            </div>
          </div>

          {/* Trust + Fraud row */}
          <div style={{ ...G.section }}>
            <div style={{ ...G.sectionTitle }}>Trust &amp; Fraud</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>

              {/* Trust score gauge */}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', flex: '0 1 200px', textAlign: 'center' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Avg Trust Score
                </div>
                <TrustGauge score={parseFloat(metrics.avg_trust_score) || 0} />
                <div style={{ color: '#444', fontSize: '0.7rem', marginTop: '0.5rem' }}>Based on 27 indicators</div>
              </div>

              {/* Fraud alerts card */}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', flex: '1' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Fraud Alerts
                </div>
                <AlertsBadge count={metrics.fraud_alerts_active} />
                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { label: 'Disposable email', rule: 'disposable_email' },
                    { label: 'No company profile', rule: 'no_company_profile' },
                    { label: 'Rapid changes', rule: 'rapid_profile_change' },
                    { label: 'IP multi-account', rule: 'ip_multi_account' },
                  ].map(r => (
                    <div key={r.rule} style={{ background: '#111', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.7rem', color: '#555' }}>
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Certification rate */}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', flex: '0 1 180px' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  Cert. Rate
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#4CAF50', marginBottom: '0.25rem' }}>
                  {metrics.cert_rate_pct}%
                </div>
                <div style={{ background: '#111', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${metrics.cert_rate_pct}%`, height: '100%',
                    background: 'linear-gradient(90deg, #4CAF50, #C9A84C)',
                    transition: 'width 0.8s ease-out',
                  }} />
                </div>
                <div style={{ color: '#444', fontSize: '0.7rem', marginTop: '0.4rem' }}>
                  {metrics.certified_total} / {metrics.companies_total}
                </div>
              </div>
            </div>
          </div>

          {/* Requests + timestamp */}
          <div style={{ ...G.section }}>
            <div style={{ ...G.sectionTitle }}>Platform Activity</div>
            <div style={{ ...G.grid, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {metrics.requests_total !== undefined && (
                <KpiCard
                  label="HTTP Requests"
                  value={metrics.requests_total}
                  color="#888"
                  subtitle="since last restart"
                />
              )}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Data as of</div>
                <div style={{ color: '#555', fontSize: '0.8rem' }}>
                  {new Date(metrics.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
