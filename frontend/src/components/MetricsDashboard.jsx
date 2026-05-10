import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

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
const KpiCard = ({ label, value, format = 'int', color = '#C9A84C', subtitle, delta, vsLabel }) => {
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
          {deltaIcon} {Math.abs(delta)} {vsLabel}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trust score gauge (0-100)
// ---------------------------------------------------------------------------
const TrustGauge = ({ score, lowRisk, medRisk, highRisk }) => {
  const animated = useAnimatedValue(score || 0)
  const pct = Math.min(Math.max(animated, 0), 100)
  const color = pct >= 70 ? '#4CAF50' : pct >= 40 ? '#f39c12' : '#e74c3c'
  const label = pct >= 70 ? lowRisk : pct >= 40 ? medRisk : highRisk

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
const AlertsBadge = ({ count, clearLabel, activeLabel }) => {
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
        {count === 0 ? clearLabel : `${count} ${activeLabel}`}
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Connection status indicator
// ---------------------------------------------------------------------------
const StatusDot = ({ live, liveLabel, pollingLabel }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
    <div style={{
      width: '7px', height: '7px', borderRadius: '50%',
      background: live ? '#4CAF50' : '#555',
      boxShadow: live ? '0 0 6px #4CAF50' : 'none',
      animation: live ? 'pulse 2.5s infinite' : 'none',
    }} />
    <span style={{ color: '#555', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
      {live ? liveLabel : pollingLabel}
    </span>
  </div>
)

// ---------------------------------------------------------------------------
// Main MetricsDashboard component
// ---------------------------------------------------------------------------
export default function MetricsDashboard() {
  const { t } = useTranslation()
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

  const fraudRules = [
    { label: t('metrics.trust.rules.disposable_email'),      rule: 'disposable_email' },
    { label: t('metrics.trust.rules.no_company_profile'),    rule: 'no_company_profile' },
    { label: t('metrics.trust.rules.rapid_profile_change'),  rule: 'rapid_profile_change' },
    { label: t('metrics.trust.rules.ip_multi_account'),      rule: 'ip_multi_account' },
  ]

  return (
    <div style={{ fontFamily: 'sans-serif', color: '#eee' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#eee' }}>{t('metrics.title')}</div>
          <div style={{ color: '#444', fontSize: '0.75rem', marginTop: '0.15rem' }}>
            {lastUpdated ? `${t('metrics.updated')} ${lastUpdated.toLocaleTimeString()}` : t('metrics.loading')}
          </div>
        </div>
        <StatusDot live={wsLive} liveLabel={t('metrics.live')} pollingLabel={t('metrics.polling')} />
      </div>

      {!metrics && (
        <div style={{ color: '#444', fontSize: '0.875rem', padding: '2rem', textAlign: 'center' }}>
          {t('metrics.fetching')}
        </div>
      )}

      {metrics && (
        <>
          {/* KPI grid — top row */}
          <div style={{ ...G.section }}>
            <div style={{ ...G.sectionTitle }}>{t('metrics.sections.registry')}</div>
            <div style={{ ...G.grid, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <KpiCard
                label={t('metrics.kpis.users')}
                value={metrics.users_total}
                color="#C9A84C"
                delta={delta('users_count', 'users_total')}
                vsLabel={t('metrics.vs_snapshot')}
              />
              <KpiCard
                label={t('metrics.kpis.companies')}
                value={metrics.companies_total}
                color="#4a90e2"
                delta={delta('companies_count', 'companies_total')}
                vsLabel={t('metrics.vs_snapshot')}
              />
              <KpiCard
                label={t('metrics.kpis.certified')}
                value={metrics.certified_total}
                color="#4CAF50"
                subtitle={`${metrics.cert_rate_pct}% ${t('metrics.kpis.cert_rate_subtitle')}`}
                delta={delta('certified_count', 'certified_total')}
                vsLabel={t('metrics.vs_snapshot')}
              />
              <KpiCard
                label={t('metrics.kpis.revenue')}
                value={metrics.revenue_total_usd}
                format="currency"
                color="#C9A84C"
                delta={prev ? metrics.revenue_total_usd - parseFloat(prev.revenue_total || 0) : undefined}
                vsLabel={t('metrics.vs_snapshot')}
              />
            </div>
          </div>

          {/* Trust + Fraud row */}
          <div style={{ ...G.section }}>
            <div style={{ ...G.sectionTitle }}>{t('metrics.sections.trust_fraud')}</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>

              {/* Trust score gauge */}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', flex: '0 1 200px', textAlign: 'center' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  {t('metrics.trust.avg_score')}
                </div>
                <TrustGauge
                  score={parseFloat(metrics.avg_trust_score) || 0}
                  lowRisk={t('metrics.trust.low_risk')}
                  medRisk={t('metrics.trust.medium_risk')}
                  highRisk={t('metrics.trust.high_risk')}
                />
                <div style={{ color: '#444', fontSize: '0.7rem', marginTop: '0.5rem' }}>{t('metrics.trust.indicators')}</div>
              </div>

              {/* Fraud alerts card */}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', flex: '1' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  {t('metrics.trust.fraud_alerts')}
                </div>
                <AlertsBadge
                  count={metrics.fraud_alerts_active}
                  clearLabel={t('metrics.trust.fraud_clear')}
                  activeLabel={t('metrics.trust.fraud_active')}
                />
                <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {fraudRules.map(r => (
                    <div key={r.rule} style={{ background: '#111', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.7rem', color: '#555' }}>
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Certification rate */}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', flex: '0 1 180px' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                  {t('metrics.trust.cert_rate')}
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
            <div style={{ ...G.sectionTitle }}>{t('metrics.sections.activity')}</div>
            <div style={{ ...G.grid, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {metrics.requests_total !== undefined && (
                <KpiCard
                  label={t('metrics.kpis.requests')}
                  value={metrics.requests_total}
                  color="#888"
                  subtitle={t('metrics.kpis.since_restart')}
                  vsLabel={t('metrics.vs_snapshot')}
                />
              )}
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ color: '#666', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{t('metrics.kpis.data_as_of')}</div>
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
