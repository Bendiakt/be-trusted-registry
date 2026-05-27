import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import Skeleton from '../components/Skeleton'

const OUTCOME_CONFIG = {
  pass:        { label: 'PASS',        color: '#2ecc71', bg: 'rgba(46,204,113,0.08)',  icon: '✓' },
  fail:        { label: 'FAIL',        color: '#ff6b6b', bg: 'rgba(231,76,60,0.08)',   icon: '✗' },
  conditional: { label: 'CONDITIONAL', color: '#f39c12', bg: 'rgba(243,156,18,0.08)',  icon: '⚠' },
}

export default function MissionReport() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { t }    = useTranslation()

  const [mission,      setMission]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [downloading,  setDownloading]  = useState(false)

  useEffect(() => {
    api.get(`/api/pac/missions/${id}`)
      .then(res => {
        setMission(res.data)
        document.title = `Mission #${res.data.id} Report — MyDD`
        setLoading(false)
      })
      .catch(() => { setError('Mission not found or access denied.'); setLoading(false) })
  }, [id])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'Inter,sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '700px' }}>
          <Skeleton height="2rem" width="60%" style={{ marginBottom: '1rem' }} />
          <Skeleton height="1rem" width="40%" style={{ marginBottom: '2rem' }} />
          <Skeleton height="10rem" width="100%" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b6b', fontFamily: 'Inter,sans-serif', textAlign: 'center', padding: '2rem' }}>
        <div>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠</div>
          <div style={{ marginBottom: '1.5rem' }}>{error}</div>
          <button onClick={() => navigate('/pac')} style={{ background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C', padding: '0.5rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
            ← Back to Portal
          </button>
        </div>
      </div>
    )
  }

  const oc = OUTCOME_CONFIG[mission.outcome] || null
  const now = new Date()

  // ── Parse structured report (v2 JSON) vs legacy plain text ────────────────
  const SECTION_LABELS = {
    executive_summary:     'Executive Summary',
    identity_verification: 'Identity & Legal Verification',
    physical_inspection:   'Physical Inspection',
    management_assessment: 'Management & Team',
    documentation_review:  'Documentation Review',
    risk_indicators:       'Risk Indicators',
    recommendation:        'Recommendation & Next Steps',
  }
  const parsedReport = (() => {
    if (!mission.reportText) return null
    try {
      const p = JSON.parse(mission.reportText)
      if (p?.v === 2 && p.sections && typeof p.sections === 'object') return p.sections
    } catch { /* legacy plain text */ }
    return null
  })()

  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .report-page { box-shadow: none !important; border: 1px solid #ddd !important; }
        }
        @media screen {
          body { background: #0a0a0a; }
        }
      `}</style>

      {/* Toolbar — hidden in print */}
      <div className="no-print" style={{ background: '#111', borderBottom: '1px solid #222', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', fontFamily: 'Inter,sans-serif' }}>
        <button
          onClick={() => navigate('/pac')}
          style={{ background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
        >
          ← {t('pac.missions.back_to_missions')}
        </button>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={async () => {
              setDownloading(true)
              try {
                const res = await api.get(`/api/pac/missions/${id}/pdf`, { responseType: 'blob' })
                const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
                const a = document.createElement('a')
                a.href = url
                a.download = `mission-report-${String(id).padStart(6, '0')}.pdf`
                a.click()
                URL.revokeObjectURL(url)
              } catch { /* silent */ }
              finally { setDownloading(false) }
            }}
            disabled={downloading}
            style={{ background: '#1a1a1a', color: '#C9A84C', border: '1px solid #333', padding: '0.5rem 1.25rem', borderRadius: '7px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', opacity: downloading ? 0.6 : 1 }}
          >
            {downloading ? '…' : '⬇ PDF'}
          </button>
          <button
            onClick={() => window.print()}
            style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '7px', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem' }}
          >
            {t('cert_print.print_pdf')}
          </button>
        </div>
      </div>

      {/* Report document */}
      <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', fontFamily: '"Georgia", serif' }}>
        <div className="report-page" style={{ width: '100%', maxWidth: '720px', background: '#fff', borderRadius: '4px', boxShadow: '0 4px 40px rgba(0,0,0,0.14)', overflow: 'hidden' }}>

          {/* Header bar */}
          <div style={{ background: oc ? oc.color : '#555', padding: '0.45rem', textAlign: 'center' }}>
            <div style={{ color: '#fff', fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.28em', textTransform: 'uppercase', opacity: 0.9 }}>
              B&amp;E CONSULT FZCO — PAC AUDIT REPORT
            </div>
          </div>

          <div style={{ padding: '3rem 4rem' }}>
            {/* Logo row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '7px', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '1.1rem', fontFamily: 'Inter,sans-serif' }}>M</div>
                <div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: '800', fontSize: '1.2rem', color: '#111' }}>MyDD</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: '0.55rem', color: '#999', letterSpacing: '0.12em', textTransform: 'uppercase' }}>My Due Diligence</div>
                </div>
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: '#aaa', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Report Date</div>
                <div style={{ fontSize: '0.85rem', color: '#333' }}>{now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>

            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#bbb', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.5rem', fontFamily: 'Inter,sans-serif' }}>
                Field Audit Report
              </div>
              <div style={{ fontSize: 'clamp(1.3rem,3vw,1.75rem)', fontWeight: '700', color: '#111', letterSpacing: '-0.01em' }}>
                {mission.company_name || `Company #${mission.company_id}`}
              </div>
              {mission.location && (
                <div style={{ color: '#888', fontSize: '0.875rem', marginTop: '0.3rem', fontFamily: 'Inter,sans-serif' }}>
                  📍 {mission.location}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: '56px', height: '2px', background: oc ? oc.color : '#ccc', margin: '0 auto 2.5rem', borderRadius: '2px' }} />

            {/* Outcome badge */}
            {oc && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', background: oc.bg, border: `1.5px solid ${oc.color}55`, borderRadius: '12px', padding: '1rem 2rem', fontFamily: 'Inter,sans-serif' }}>
                  <span style={{ fontSize: '1.5rem', color: oc.color }}>{oc.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.6rem', color: oc.color, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: '700', marginBottom: '0.2rem' }}>Audit Outcome</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: oc.color, letterSpacing: '0.05em' }}>{oc.label}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Mission details table */}
            <div style={{ background: '#fafafa', borderRadius: '8px', overflow: 'hidden', marginBottom: '2rem', fontFamily: 'Inter,sans-serif', fontSize: '0.82rem' }}>
              {[
                { label: 'Mission ID',     value: `#${String(mission.id).padStart(5, '0')}` },
                { label: 'Type',           value: mission.type ? mission.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—' },
                { label: 'Status',         value: (mission.status || '').toUpperCase() },
                { label: 'Assigned Agent', value: mission.pacAgentName || mission.assigned_to ? `Agent #${mission.assigned_to}` : '—' },
                { label: 'Completed On',   value: mission.completedAt ? new Date(mission.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
                { label: 'Fee',            value: mission.fee ? `$${mission.fee}` : '—' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', padding: '0.7rem 1rem', borderBottom: '1px solid #eee' }}>
                  <div style={{ color: '#999', width: '40%', fontWeight: '500' }}>{row.label}</div>
                  <div style={{ color: '#333', fontWeight: '600' }}>{row.value}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            {mission.description && (
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.6rem', fontFamily: 'Inter,sans-serif' }}>
                  Mission Scope
                </div>
                <div style={{ color: '#444', fontSize: '0.875rem', lineHeight: 1.7, fontFamily: 'Inter,sans-serif' }}>
                  {mission.description}
                </div>
              </div>
            )}

            {/* Report findings — structured (v2) or legacy plain text */}
            {parsedReport ? (
              // ── Structured report ────────────────────────────────────────
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1.25rem', fontFamily: 'Inter,sans-serif' }}>
                  Audit Findings
                </div>
                {Object.entries(SECTION_LABELS).map(([key, label]) => {
                  const content = parsedReport[key]
                  if (!content) return null
                  const isRisk = key === 'risk_indicators'
                  return (
                    <div key={key} style={{ marginBottom: '1.5rem', pageBreakInside: 'avoid' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontFamily: 'Inter,sans-serif' }}>
                        {isRisk && <span style={{ fontSize: '0.75rem' }}>⚑</span>}
                        <div style={{ fontSize: '0.6rem', color: isRisk ? '#e74c3c' : '#bbb', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: '700' }}>
                          {label}
                        </div>
                      </div>
                      <div style={{ color: '#333', fontSize: '0.88rem', lineHeight: 1.75, whiteSpace: 'pre-wrap', borderLeft: `2px solid ${isRisk ? '#e74c3c33' : '#eee'}`, paddingLeft: '0.85rem' }}>
                        {content}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : mission.reportText ? (
              // ── Legacy plain text (backward compat) ──────────────────────
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '0.6rem', fontFamily: 'Inter,sans-serif' }}>
                  Audit Findings
                </div>
                <div style={{ color: '#222', fontSize: '0.9rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {mission.reportText}
                </div>
              </div>
            ) : null}

            {/* Signature area */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', fontFamily: 'Inter,sans-serif' }}>
              <div>
                <div style={{ fontSize: '0.62rem', color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>PAC Agent</div>
                <div style={{ fontSize: '0.85rem', color: '#333', fontWeight: '600' }}>{mission.pacAgentName || 'B&E PAC Agent'}</div>
                {mission.pacLocation && <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.1rem' }}>📍 {mission.pacLocation}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.62rem', color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Issued by</div>
                <div style={{ fontSize: '0.85rem', color: '#333', fontWeight: '600' }}>B&amp;E Consult FZCO</div>
                <div style={{ fontSize: '0.72rem', color: '#999', marginTop: '0.1rem' }}>Dubai Silicon Oasis, UAE</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ background: '#111', padding: '0.85rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ color: '#555', fontSize: '0.6rem', fontFamily: 'Inter,sans-serif', letterSpacing: '0.05em' }}>
              © {now.getFullYear()} B&amp;E Consult FZCO · mydd.work
            </div>
            <div style={{ color: '#444', fontSize: '0.6rem', fontFamily: 'Inter,sans-serif' }}>
              REPORT-{String(mission.id).padStart(6, '0')} · Confidential
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
