import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'
import LanguageSwitcher from '../components/LanguageSwitcher'
import PACSupervisionDashboard from '../components/PACSupervisionDashboard'

const OUTCOME_COLORS = {
  pass:        { bg: 'rgba(46,204,113,0.12)',  border: 'rgba(46,204,113,0.4)',  text: '#2ecc71' },
  fail:        { bg: 'rgba(231,76,60,0.12)',   border: 'rgba(231,76,60,0.4)',   text: '#ff6b6b' },
  conditional: { bg: 'rgba(243,156,18,0.12)',  border: 'rgba(243,156,18,0.4)',  text: '#f39c12' },
}

export default function PACPortal() {
  const { t } = useTranslation()
  const [missions, setMissions]         = useState([])
  const [profile, setProfile]           = useState({ name: '', location: '', languages: '', certifications: '', bio: '' })
  const [pacTier, setPacTier]           = useState('S1')
  const [msg, setMsg]                   = useState({ text: '', type: '' })
  const [tab, setTab]                   = useState('missions')
  const [reportForms, setReportForms]   = useState({})   // { [missionId]: { open, text, outcome, submitting } }
  const [kycStatus, setKycStatus]         = useState('pending')
  const [membershipActive, setMembershipActive]   = useState(false)
  const [membershipExpires, setMembershipExpires] = useState(null)
  const [upgradeMsg, setUpgradeMsg]       = useState(null) // { text, type }
  const [upgrading, setUpgrading]         = useState(false)
  const [upgradeBanner, setUpgradeBanner] = useState(null) // retour Stripe
  const [progress, setProgress]           = useState(null) // GET /api/pac/progress
  const [earnings, setEarnings]           = useState(null) // GET /api/pac/earnings
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const user = getSession()
    if (!user) { navigate('/login'); return }
    const role = user.role
    if (role !== 'pac') { navigate(role === 'admin' ? '/admin' : '/dashboard'); return }

    // Handle Stripe return URL params
    const upgradeParam = searchParams.get('upgrade')
    const tierParam    = searchParams.get('tier')
    if (upgradeParam === 'success') {
      setUpgradeBanner({ type: 'success', tier: tierParam, text: `🎉 Paiement confirmé pour le niveau ${tierParam || 'suivant'} ! Votre dossier est en cours d'examen par l'équipe B&E.` })
      setTab('progression')
      // Clean URL without reload
      searchParams.delete('upgrade')
      searchParams.delete('tier')
      setSearchParams(searchParams, { replace: true })
    } else if (upgradeParam === 'cancelled') {
      setUpgradeMsg({ text: 'Paiement annulé. Votre abonnement n\'a pas été modifié.', type: 'error' })
      setTab('progression')
      searchParams.delete('upgrade')
      setSearchParams(searchParams, { replace: true })
    }

    api.get('/api/pac/missions')
      .then(res => setMissions(res.data)).catch(() => {})
    api.get('/api/pac/progress')
      .then(res => setProgress(res.data)).catch(() => {})
    api.get('/api/pac/earnings')
      .then(res => setEarnings(res.data)).catch(() => {})
    api.get('/api/pac/profile')
      .then(res => {
        if (res.data && Object.keys(res.data).length > 0) {
          setProfile(p => ({ ...p, ...res.data }))
          if (res.data.pac_tier)           setPacTier(res.data.pac_tier)
          if (res.data.kyc_status)         setKycStatus(res.data.kyc_status)
          if (res.data.membership_active)  setMembershipActive(res.data.membership_active)
          if (res.data.membership_expires) setMembershipExpires(res.data.membership_expires)
        }
      })
      .catch(() => {})
  }, [])

  const saveProfile = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/pac/profile', profile)
      setMsg({ text: t('pac.profile.saved'), type: 'success' })
    } catch { setMsg({ text: t('pac.profile.error'), type: 'error' }) }
  }

  const acceptMission = async (id) => {
    try {
      await api.post(`/api/pac/missions/${id}/accept`, {})
      setMsg({ text: t('pac.missions.mission_accepted'), type: 'success' })
      setMissions(prev => prev.map(m => m.id === id ? { ...m, status: 'assigned' } : m))
    } catch { setMsg({ text: t('pac.missions.error_accept'), type: 'error' }) }
  }

  // ── Structured report sections ────────────────────────────────────────────
  const REPORT_SECTIONS = [
    { key: 'executive_summary',      label: 'Executive Summary',            required: true,  rows: 4, hint: 'Brief overall conclusion of the audit visit.' },
    { key: 'identity_verification',  label: 'Identity & Legal Verification', required: true,  rows: 3, hint: 'Existence légale, documents officiels, concordance.' },
    { key: 'physical_inspection',    label: 'Physical Inspection',           required: false, rows: 3, hint: 'Premises, equipment, operational activity observed on site.' },
    { key: 'management_assessment',  label: 'Management & Team',             required: false, rows: 3, hint: 'Key contacts, responsiveness, organizational structure.' },
    { key: 'documentation_review',   label: 'Documentation Review',          required: false, rows: 3, hint: 'Documents received, completeness, anomalies.' },
    { key: 'risk_indicators',        label: 'Risk Indicators',               required: false, rows: 2, hint: 'Any flags or concerns noted. Write "None" if all clear.' },
    { key: 'recommendation',         label: 'Recommendation & Next Steps',   required: false, rows: 2, hint: 'Suggested actions for the client or platform.' },
  ]
  const EMPTY_SECTIONS = Object.fromEntries(REPORT_SECTIONS.map(s => [s.key, '']))

  const toggleReportForm = (id) => {
    setReportForms(prev => ({
      ...prev,
      [id]: prev[id]?.open
        ? { ...prev[id], open: false }
        : { open: true, sections: { ...EMPTY_SECTIONS }, outcome: 'pass', submitting: false },
    }))
  }

  const submitReport = async (mission) => {
    const form = reportForms[mission.id]
    const summary = form?.sections?.executive_summary?.trim() || ''
    if (!summary) return
    setReportForms(prev => ({ ...prev, [mission.id]: { ...prev[mission.id], submitting: true } }))
    // Serialize structured sections as JSON v2
    const report_text = JSON.stringify({
      v: 2,
      sections: Object.fromEntries(
        Object.entries(form.sections).filter(([, v]) => v.trim())
      ),
    })
    try {
      await api.post(`/api/pac/missions/${mission.id}/complete`, {
        report_text,
        outcome: form.outcome,
      })
      setMsg({ text: t('pac.missions.mission_completed'), type: 'success' })
      setMissions(prev => prev.map(m => m.id === mission.id
        ? { ...m, status: 'completed', reportText: report_text, outcome: form.outcome }
        : m
      ))
      setReportForms(prev => ({ ...prev, [mission.id]: { open: false } }))
    } catch {
      setMsg({ text: t('pac.missions.error_complete'), type: 'error' })
      setReportForms(prev => ({ ...prev, [mission.id]: { ...prev[mission.id], submitting: false } }))
    }
  }

  const requestUpgrade = async () => {
    setUpgrading(true)
    setUpgradeMsg(null)
    try {
      const res = await api.post('/api/payments/pac-upgrade-checkout')
      // Redirect to Stripe Checkout
      window.location.href = res.data.url
    } catch (e) {
      setUpgradeMsg({ text: e.response?.data?.error || 'Erreur lors de la demande.', type: 'error' })
      setUpgrading(false)
    }
    // Note: setUpgrading(false) not called on success — page will redirect to Stripe
  }

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch { /* best-effort */ }
    clearSession()
    navigate('/login')
  }

  const TABS = [
    { id: 'missions',    label: t('pac.tabs.missions') },
    { id: 'profile',     label: t('pac.tabs.profile') },
    { id: 'earnings',    label: '💰 Revenus' },
    ...(pacTier === 'S2' || pacTier === 'S3'
      ? [{ id: 'supervision', label: pacTier === 'S3' ? 'Mentoring S3' : 'Supervision S2' }]
      : []),
    ...(pacTier === 'S1' || pacTier === 'S2'
      ? [{ id: 'progression', label: '🎯 Progression' }]
      : []),
  ]

  const inp = { width: '100%', padding: '0.7rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }
  const lbl = { display: 'block', color: '#666', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.4rem', letterSpacing: '0.06em', textTransform: 'uppercase' }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0e', fontFamily: 'Inter,sans-serif' }}>
      <nav style={{ background: '#161616', borderBottom: '1px solid #C9A84C33', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '6px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '0.9rem' }}>M</div>
          <div>
            <div style={{ color: '#fff', fontWeight: '800', fontSize: '1rem', letterSpacing: '-0.01em' }}>MyDD</div>
            <div style={{ color: '#555', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('nav.pac_portal')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <LanguageSwitcher />
          <button onClick={logout} style={{ background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C44', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '0.05em' }}>{t('nav.logout')}</button>
        </div>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Stripe return banner — upgrade payment success */}
        {upgradeBanner && (
          <div style={{
            padding: '1rem 1.25rem', borderRadius: '10px', marginBottom: '1.5rem', fontSize: '0.9rem',
            background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.35)', color: '#2ecc71',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          }}>
            <span>{upgradeBanner.text}</span>
            <button onClick={() => setUpgradeBanner(null)} style={{ background: 'transparent', border: 'none', color: '#2ecc71', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
          </div>
        )}
        {msg.text && (
          <div style={{
            padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem',
            background: msg.type === 'success' ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)',
            border: msg.type === 'success' ? '1px solid rgba(46,204,113,0.4)' : '1px solid rgba(231,76,60,0.4)',
            color: msg.type === 'success' ? '#2ecc71' : '#ff6b6b',
          }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '2rem', borderBottom: '1px solid #222' }}>
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '0.75rem 1.5rem', background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === id ? '#C9A84C' : '#555',
              borderBottom: tab === id ? '2px solid #C9A84C' : '2px solid transparent',
              fontWeight: tab === id ? '700' : '400',
              fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'missions' && (
          <div>
            {/* Stats summary */}
            <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{t('pac.missions.status_title')}</div>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div><div style={{ color: '#555', fontSize: '0.75rem' }}>{t('pac.missions.active')}</div><div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: '800' }}>{missions.filter(m => m.status === 'assigned').length}</div></div>
                <div><div style={{ color: '#555', fontSize: '0.75rem' }}>{t('pac.missions.available')}</div><div style={{ color: '#C9A84C', fontSize: '1.5rem', fontWeight: '800' }}>{missions.filter(m => m.status === 'available').length}</div></div>
                <div><div style={{ color: '#555', fontSize: '0.75rem' }}>{t('pac.missions.completed')}</div><div style={{ color: '#2ecc71', fontSize: '1.5rem', fontWeight: '800' }}>{missions.filter(m => m.status === 'completed').length}</div></div>
              </div>
            </div>

            {missions.length === 0 ? (
              <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
                <div style={{ color: '#C9A84C', fontSize: '1rem', fontWeight: '700', marginBottom: '0.5rem' }}>{t('pac.missions.no_missions')}</div>
                <div style={{ color: '#555', fontSize: '0.875rem' }}>{t('pac.missions.no_missions_desc')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {missions.map(m => {
                  const rf = reportForms[m.id] || {}
                  const outcomeStyle = m.outcome ? (OUTCOME_COLORS[m.outcome] || OUTCOME_COLORS.pass) : null

                  return (
                    <div key={m.id} style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', overflow: 'hidden' }}>
                      {/* Mission header row */}
                      <div style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#fff', fontWeight: '700', fontSize: '1rem', marginBottom: '0.25rem' }}>{m.company_name}</div>
                          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{m.location}{m.type ? ` · ${m.type}` : ''}</div>
                          <div style={{ color: '#555', fontSize: '0.8rem' }}>{m.description}</div>
                          {m.completedAt && (
                            <div style={{ color: '#444', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                              {t('pac.missions.completed_on')} {new Date(m.completedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#C9A84C', fontWeight: '800', fontSize: '1rem' }}>${m.fee || '500'}</div>
                            <div style={{ color: '#555', fontSize: '0.7rem' }}>{t('pac.missions.fee')}</div>
                          </div>

                          {m.status === 'available' && (
                            <button onClick={() => acceptMission(m.id)} style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                              {t('pac.missions.accept')}
                            </button>
                          )}

                          {m.status === 'assigned' && (
                            <button onClick={() => toggleReportForm(m.id)} style={{ background: rf.open ? 'rgba(201,168,76,0.15)' : 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: rf.open ? '#C9A84C' : '#111', padding: '0.6rem 1.25rem', borderRadius: '8px', border: rf.open ? '1px solid #C9A84C44' : 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                              {rf.open ? t('pac.missions.cancel_report') : t('pac.missions.submit_report_btn')}
                            </button>
                          )}

                          {m.status === 'completed' && outcomeStyle && (
                            <div style={{ background: outcomeStyle.bg, color: outcomeStyle.text, padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700', border: `1px solid ${outcomeStyle.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {t(`pac.missions.outcome_${m.outcome}`)}
                            </div>
                          )}

                          {m.status === 'completed' && !m.outcome && (
                            <div style={{ background: 'rgba(46,204,113,0.12)', color: '#2ecc71', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', border: '1px solid rgba(46,204,113,0.3)' }}>
                              {t('pac.missions.completed_badge')}
                            </div>
                          )}

                          {m.status === 'completed' && (
                            <Link
                              to={`/pac/missions/${m.id}/report`}
                              style={{ background: 'transparent', color: '#555', border: '1px solid #2a2a2a', padding: '0.5rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', textDecoration: 'none', whiteSpace: 'nowrap' }}
                            >
                              {t('pac.missions.view_report')} ↗
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Completed report preview */}
                      {m.status === 'completed' && m.reportText && (
                        <div style={{ borderTop: '1px solid #1e1e1e', padding: '1rem 1.25rem', background: 'rgba(46,204,113,0.03)' }}>
                          <div style={{ color: '#555', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{t('pac.missions.report_text')}</div>
                          <div style={{ color: '#888', fontSize: '0.85rem', lineHeight: '1.5' }}>{m.reportText}</div>
                        </div>
                      )}

                      {/* Report submission form */}
                      {m.status === 'assigned' && rf.open && (
                        <div style={{ borderTop: '1px solid #222', padding: '1.25rem', background: 'rgba(201,168,76,0.03)' }}>
                          <div style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' }}>{t('pac.missions.submit_report')}</div>

                          <div style={{ marginBottom: '1rem' }}>
                            <label style={lbl}>{t('pac.missions.outcome')}</label>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {['pass', 'fail', 'conditional'].map(opt => {
                                const oc = OUTCOME_COLORS[opt]
                                const sel = rf.outcome === opt
                                return (
                                  <button key={opt} type="button" onClick={() => setReportForms(prev => ({ ...prev, [m.id]: { ...prev[m.id], outcome: opt } }))}
                                    style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: `1px solid ${sel ? oc.border : '#333'}`, background: sel ? oc.bg : 'transparent', color: sel ? oc.text : '#555', fontWeight: sel ? '700' : '400', cursor: 'pointer', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    {t(`pac.missions.outcome_${opt}`)}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* ── Structured report sections ─── */}
                          <div style={{ marginBottom: '1rem' }}>
                            <div style={{ color: '#C9A84C', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                              Audit Report — Structured Template
                            </div>
                            {REPORT_SECTIONS.map(sec => (
                              <div key={sec.key} style={{ marginBottom: '0.9rem' }}>
                                <label style={{ ...lbl, display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                                  {sec.label}
                                  {sec.required && <span style={{ color: '#e74c3c', fontSize: '0.65rem' }}>*</span>}
                                  <span style={{ color: '#333', fontSize: '0.68rem', fontWeight: '400', marginLeft: '0.25rem' }}>— {sec.hint}</span>
                                </label>
                                <textarea
                                  rows={sec.rows}
                                  placeholder={sec.required ? `${sec.label} (required)` : `${sec.label} (optional)`}
                                  style={{ ...inp, resize: 'vertical' }}
                                  value={rf.sections?.[sec.key] || ''}
                                  onChange={e => setReportForms(prev => ({
                                    ...prev,
                                    [m.id]: { ...prev[m.id], sections: { ...prev[m.id].sections, [sec.key]: e.target.value } },
                                  }))}
                                />
                              </div>
                            ))}
                          </div>

                          <button
                            onClick={() => submitReport(m)}
                            disabled={rf.submitting || !rf.sections?.executive_summary?.trim()}
                            style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.7rem 1.75rem', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: rf.submitting || !rf.sections?.executive_summary?.trim() ? 'default' : 'pointer', fontSize: '0.875rem', opacity: rf.submitting || !rf.sections?.executive_summary?.trim() ? 0.6 : 1 }}>
                            {rf.submitting ? '…' : t('pac.missions.submit_report_btn')}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '2rem' }}>
            <div style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.5rem' }}>{t('pac.profile.title')}</div>
            <form onSubmit={saveProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={lbl}>{t('pac.profile.full_name')}</label>
                  <input type="text" style={inp} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>{t('pac.profile.location')}</label>
                  <input type="text" placeholder={t('pac.profile.location_placeholder')} style={inp} value={profile.location} onChange={e => setProfile({ ...profile, location: e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>{t('pac.profile.languages')}</label>
                  <input type="text" placeholder={t('pac.profile.languages_placeholder')} style={inp} value={profile.languages} onChange={e => setProfile({ ...profile, languages: e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>{t('pac.profile.certifications')}</label>
                  <input type="text" placeholder={t('pac.profile.certifications_placeholder')} style={inp} value={profile.certifications} onChange={e => setProfile({ ...profile, certifications: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={lbl}>{t('pac.profile.bio')}</label>
                <textarea rows={3} placeholder={t('pac.profile.bio_placeholder')} style={{ ...inp, resize: 'vertical' }} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} />
              </div>
              <button type="submit" style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', letterSpacing: '0.04em' }}>
                {t('pac.profile.save')}
              </button>
            </form>
          </div>
        )}

        {/* ── Earnings tab ──────────────────────────────────────────────────── */}
        {tab === 'earnings' && (
          <div style={{ padding: '0 2rem 2rem' }}>
            {!earnings ? (
              <div style={{ color: '#555', fontSize: '0.85rem', padding: '2rem 0', textAlign: 'center' }}>Chargement…</div>
            ) : (
              <>
                {/* ── Summary stats ─────────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
                  {[
                    {
                      label: 'Total perçu',
                      value: `$${earnings.summary.totalEarnedUsd.toFixed(2)}`,
                      color: '#2ecc71',
                      sub: `${earnings.summary.paidCount} mission(s) payée(s)`,
                    },
                    {
                      label: 'En attente',
                      value: `$${earnings.summary.pendingUsd.toFixed(2)}`,
                      color: '#f39c12',
                      sub: `${earnings.summary.completedCount - earnings.summary.paidCount} mission(s) complétée(s)`,
                    },
                    {
                      label: 'Taux de commission',
                      value: `${earnings.summary.commissionPct}%`,
                      color: earnings.summary.pacTier === 'S3' ? '#e056fd' : earnings.summary.pacTier === 'S2' ? '#C9A84C' : '#4a90e2',
                      sub: `Tier ${earnings.summary.pacTier}`,
                    },
                    {
                      label: 'Missions totales',
                      value: earnings.summary.completedCount,
                      color: '#aaa',
                      sub: 'assignées ou complétées',
                    },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
                      <div style={{ color: '#555', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>{stat.label}</div>
                      <div style={{ color: stat.color, fontSize: '1.6rem', fontWeight: '900', lineHeight: 1.1, marginBottom: '0.3rem' }}>{stat.value}</div>
                      <div style={{ color: '#444', fontSize: '0.7rem' }}>{stat.sub}</div>
                    </div>
                  ))}
                </div>

                {/* ── Mission breakdown table ────────────────────────────────── */}
                <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: '#fff', fontWeight: '700', fontSize: '0.9rem' }}>Détail des missions</div>
                    <div style={{ color: '#555', fontSize: '0.75rem' }}>{earnings.missions.length} entrée(s)</div>
                  </div>

                  {earnings.missions.length === 0 ? (
                    <div style={{ padding: '2rem', color: '#555', textAlign: 'center', fontSize: '0.85rem' }}>
                      Aucune mission assignée pour le moment.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #222' }}>
                            {['#', 'Entreprise', 'Lieu', 'Honoraires', 'Commission', 'Paiement', 'Statut'].map(h => (
                              <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#555', fontWeight: '600', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {earnings.missions.map((m, i) => {
                            const isPaid    = !!m.paymentConfirmedAt
                            const isComplete = m.status === 'completed'
                            return (
                              <tr key={m.id} style={{ borderBottom: '1px solid #1a1a1a', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                <td style={{ padding: '0.7rem 1rem', color: '#444', fontWeight: '700' }}>#{m.id}</td>
                                <td style={{ padding: '0.7rem 1rem', color: '#ccc', fontWeight: '600', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {m.companyName || '—'}
                                </td>
                                <td style={{ padding: '0.7rem 1rem', color: '#666', whiteSpace: 'nowrap' }}>{m.location || '—'}</td>
                                <td style={{ padding: '0.7rem 1rem', color: '#C9A84C', fontWeight: '700', whiteSpace: 'nowrap' }}>${m.feeUsd}</td>
                                <td style={{ padding: '0.7rem 1rem', whiteSpace: 'nowrap' }}>
                                  <span style={{ color: isPaid ? '#2ecc71' : '#f39c12', fontWeight: '700' }}>
                                    ${m.commissionUsd.toFixed(2)}
                                  </span>
                                </td>
                                <td style={{ padding: '0.7rem 1rem', whiteSpace: 'nowrap' }}>
                                  {isPaid ? (
                                    <span style={{ background: 'rgba(46,204,113,0.1)', color: '#2ecc71', fontSize: '0.65rem', fontWeight: '700', padding: '0.18rem 0.5rem', borderRadius: '4px' }}>
                                      ✓ Payé {new Date(m.paymentConfirmedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                                    </span>
                                  ) : isComplete ? (
                                    <span style={{ background: 'rgba(243,156,18,0.1)', color: '#f39c12', fontSize: '0.65rem', fontWeight: '700', padding: '0.18rem 0.5rem', borderRadius: '4px' }}>
                                      ⏳ En attente
                                    </span>
                                  ) : (
                                    <span style={{ color: '#444', fontSize: '0.68rem' }}>—</span>
                                  )}
                                </td>
                                <td style={{ padding: '0.7rem 1rem', whiteSpace: 'nowrap' }}>
                                  <span style={{
                                    fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase',
                                    background: m.status === 'completed' ? 'rgba(46,204,113,0.08)' : m.status === 'in_progress' ? 'rgba(74,144,226,0.1)' : 'rgba(255,255,255,0.05)',
                                    color:      m.status === 'completed' ? '#2ecc71'               : m.status === 'in_progress' ? '#4a90e2'              : '#555',
                                  }}>
                                    {m.status}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── Payout note ───────────────────────────────────────────── */}
                <div style={{ marginTop: '1.25rem', padding: '1rem 1.25rem', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '8px', color: '#666', fontSize: '0.78rem', lineHeight: '1.6' }}>
                  💡 <strong style={{ color: '#C9A84C' }}>Comment sont calculées vos commissions ?</strong><br />
                  Chaque mission a un honoraire fixe. Votre commission ({earnings.summary.commissionPct}% en tant qu'agent {earnings.summary.pacTier}) est calculée dès que l'entreprise cliente confirme le paiement de la mission via Stripe. Les virements sont effectués par B&E Consult FZCO selon votre cycle mensuel.
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'supervision' && (
          <div style={{ padding: '0 2rem 2rem' }}>
            <PACSupervisionDashboard pacTier={pacTier} />
          </div>
        )}

        {tab === 'progression' && (
          <div>
            {/* Current status card */}
            <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '1.75rem 2rem', marginBottom: '1.25rem' }}>
              <div style={{ color: '#C9A84C', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' }}>
                Mon Statut PAC
              </div>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#555', fontSize: '0.72rem', marginBottom: '0.3rem' }}>Tier actuel</div>
                  <div style={{ fontSize: '2rem', fontWeight: '900', color: pacTier === 'S3' ? '#e056fd' : pacTier === 'S2' ? '#C9A84C' : '#4a90e2' }}>{pacTier}</div>
                </div>
                <div>
                  <div style={{ color: '#555', fontSize: '0.72rem', marginBottom: '0.3rem' }}>Statut KYC</div>
                  <div style={{
                    display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase',
                    background: kycStatus === 'approved' ? 'rgba(46,204,113,0.12)' : kycStatus === 'pending' ? 'rgba(243,156,18,0.12)' : 'rgba(231,76,60,0.12)',
                    color: kycStatus === 'approved' ? '#2ecc71' : kycStatus === 'pending' ? '#f39c12' : '#ff6b6b',
                  }}>{kycStatus}</div>
                </div>
                <div>
                  <div style={{ color: '#555', fontSize: '0.72rem', marginBottom: '0.3rem' }}>Missions complétées</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#eee' }}>{missions.filter(m => m.status === 'completed').length}</div>
                </div>
                {pacTier !== 'S1' && (
                  <div>
                    <div style={{ color: '#555', fontSize: '0.72rem', marginBottom: '0.3rem' }}>Abonnement</div>
                    <div style={{
                      display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700',
                      background: membershipActive ? 'rgba(46,204,113,0.12)' : 'rgba(231,76,60,0.12)',
                      color: membershipActive ? '#2ecc71' : '#ff6b6b',
                    }}>
                      {membershipActive ? '✓ Actif' : '✗ Inactif'}
                    </div>
                    {membershipExpires && (
                      <div style={{ color: '#555', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                        jusqu'au {new Date(membershipExpires).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Achievement progress — fetched from /api/pac/progress */}
            {progress && progress.criteria && progress.criteria.length > 0 && (
              <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '1.75rem 2rem', marginBottom: '1.25rem' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ color: '#C9A84C', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    🎯 Critères — vers {progress.target_tier}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ color: progress.progress_pct === 100 ? '#2ecc71' : '#C9A84C', fontWeight: '900', fontSize: '1.35rem', letterSpacing: '-0.02em' }}>
                      {progress.progress_pct}%
                    </div>
                    <div style={{ color: '#444', fontSize: '0.72rem' }}>complétés</div>
                  </div>
                </div>

                {/* Global progress bar */}
                <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '3px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${progress.progress_pct}%`,
                    background: progress.progress_pct === 100
                      ? 'linear-gradient(90deg,#2ecc71,#27ae60)'
                      : 'linear-gradient(90deg,#C9A84C,#9A7B2E)',
                    borderRadius: '3px',
                    transition: 'width 0.6s ease',
                  }} />
                </div>

                {/* Criteria list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {progress.criteria.map((c) => {
                    const fmtVal = (val, fmt) => {
                      if (fmt === 'percent')  return `${Math.round(val * 100)}%`
                      if (fmt === 'boolean')  return val ? 'Oui' : 'Non'
                      return val
                    }
                    const fmtTarget = (tgt, fmt) => {
                      if (fmt === 'percent')  return `${Math.round(tgt * 100)}%`
                      if (fmt === 'boolean')  return 'Oui'
                      return tgt
                    }
                    const barPct = c.format === 'boolean'
                      ? (c.met ? 100 : 0)
                      : Math.min(Math.round((c.value / c.target) * 100), 100)
                    const icon = c.met ? '✅' : c.value > 0 ? '⏳' : '⚠️'

                    return (
                      <div key={c.key} style={{
                        background: c.met ? 'rgba(46,204,113,0.04)' : '#111',
                        border: `1px solid ${c.met ? 'rgba(46,204,113,0.15)' : '#1a1a1a'}`,
                        borderRadius: '8px',
                        padding: '0.85rem 1rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                            <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{icon}</span>
                            <span style={{ fontSize: '0.85rem', color: c.met ? '#bbb' : '#777', fontWeight: c.met ? '500' : '400' }}>
                              {c.label}
                            </span>
                          </div>
                          <div style={{
                            fontSize: '0.8rem', fontWeight: '700',
                            color: c.met ? '#2ecc71' : barPct >= 50 ? '#C9A84C' : '#666',
                            whiteSpace: 'nowrap', marginLeft: '0.75rem',
                          }}>
                            {fmtVal(c.value, c.format)}
                            <span style={{ color: '#333', fontWeight: '400' }}> / {fmtTarget(c.target, c.format)}</span>
                          </div>
                        </div>
                        {/* Per-criterion bar — only when not met and not boolean */}
                        {!c.met && c.format !== 'boolean' && (
                          <div style={{ height: '3px', background: '#1a1a1a', borderRadius: '2px', marginTop: '0.55rem', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${barPct}%`,
                              background: barPct >= 70 ? '#C9A84C' : barPct >= 40 ? '#4a90e2' : '#2c3e50',
                              borderRadius: '2px',
                              transition: 'width 0.4s ease',
                            }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* All-criteria-met banner */}
                {progress.progress_pct === 100 && (
                  <div style={{
                    marginTop: '1.25rem', padding: '1rem 1.25rem',
                    background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.25)',
                    borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  }}>
                    <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🎉</span>
                    <div>
                      <div style={{ color: '#2ecc71', fontWeight: '700', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        Tous les critères sont remplis !
                      </div>
                      <div style={{ color: '#666', fontSize: '0.8rem', lineHeight: '1.5' }}>
                        Votre dossier sera examiné lors de la prochaine revue mensuelle de l'équipe B&E.
                        Vous recevrez un e-mail de confirmation dès la décision.
                      </div>
                    </div>
                  </div>
                )}

                {/* Anniversary date when active */}
                {progress.tier_anniversary && (
                  <div style={{ marginTop: '1rem', color: '#444', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>🗓</span>
                    <span>Renouvellement le {new Date(progress.tier_anniversary).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                  </div>
                )}
              </div>
            )}

            {/* Upgrade path — Stripe checkout (self-initiated) */}
            {(() => {
              const nextTier = pacTier === 'S1' ? 'S2' : 'S3'
              const requiredMissions = pacTier === 'S1' ? 5 : 10
              const completedCount = missions.filter(m => m.status === 'completed').length
              const meetsRequirement = completedCount >= requiredMissions
              const alreadyPending = kycStatus === 'pending'

              const tierBenefits = {
                S2: ['Superviser jusqu\'à 10 agents S1', 'Commission B&E : 15% par mission', 'Bonus L1 : 5% du CA net de votre réseau', 'Accès aux missions de niveau avancé'],
                S3: ['Mentorer jusqu\'à 5 superviseurs S2', 'Commission B&E : 20% par mission', 'Bonus L1 + L2 sur l\'ensemble du réseau', 'Accès prioritaire aux nouvelles missions', 'Participation aux sessions stratégiques B&E HQ'],
              }

              return (
                <div style={{ background: '#161616', border: '1px solid #222', borderRadius: '12px', padding: '1.75rem 2rem' }}>
                  <div style={{ color: '#C9A84C', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1rem' }}>
                    Évolution vers {nextTier}
                  </div>

                  {/* Benefits */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ color: '#888', fontSize: '0.82rem', marginBottom: '0.75rem' }}>Avantages du niveau {nextTier} :</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {tierBenefits[nextTier].map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', color: '#ccc' }}>
                          <span style={{ color: '#C9A84C', fontSize: '0.9rem' }}>✦</span> {b}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Minimal requirement reminder */}
                  <div style={{ background: '#111', borderRadius: '8px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                    <div style={{ color: '#555', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                      Pré-requis minimum pour postuler
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ color: meetsRequirement ? '#2ecc71' : '#333', fontSize: '1rem', width: '20px' }}>
                          {meetsRequirement ? '✓' : '○'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', color: meetsRequirement ? '#ccc' : '#666' }}>
                            {requiredMissions} missions complétées
                            <span style={{ color: meetsRequirement ? '#2ecc71' : '#888', marginLeft: '0.5rem', fontWeight: '600' }}>
                              ({completedCount}/{requiredMissions})
                            </span>
                          </div>
                          {!meetsRequirement && (
                            <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '2px', marginTop: '0.4rem', maxWidth: '200px' }}>
                              <div style={{ height: '100%', width: `${Math.min(completedCount / requiredMissions * 100, 100)}%`, background: '#C9A84C', borderRadius: '2px' }} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ color: profile.name ? '#2ecc71' : '#333', fontSize: '1rem', width: '20px' }}>
                          {profile.name ? '✓' : '○'}
                        </span>
                        <div style={{ fontSize: '0.85rem', color: profile.name ? '#ccc' : '#666' }}>
                          Profil complété (nom, localisation, bio)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action */}
                  {upgradeMsg && (
                    <div style={{
                      padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem',
                      background: upgradeMsg.type === 'success' ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                      border: upgradeMsg.type === 'success' ? '1px solid rgba(46,204,113,0.3)' : '1px solid rgba(231,76,60,0.3)',
                      color: upgradeMsg.type === 'success' ? '#2ecc71' : '#ff6b6b',
                    }}>
                      {upgradeMsg.text}
                    </div>
                  )}

                  {alreadyPending ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(243,156,18,0.08)', borderRadius: '8px', border: '1px solid rgba(243,156,18,0.2)' }}>
                      <span style={{ fontSize: '1.2rem' }}>⏳</span>
                      <div>
                        <div style={{ color: '#f39c12', fontWeight: '600', fontSize: '0.9rem' }}>Demande en cours d'examen</div>
                        <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          Votre dossier est en cours de vérification par l'équipe B&E. Vous serez notifié dès la décision.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={requestUpgrade}
                      disabled={upgrading || !meetsRequirement || !profile.name}
                      style={{
                        background: meetsRequirement && profile.name ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#1a1a1a',
                        color: meetsRequirement && profile.name ? '#111' : '#444',
                        padding: '0.85rem 2rem', borderRadius: '8px', border: 'none',
                        fontWeight: '700', cursor: meetsRequirement && profile.name && !upgrading ? 'pointer' : 'not-allowed',
                        fontSize: '0.9rem', letterSpacing: '0.04em',
                        opacity: upgrading ? 0.7 : 1,
                      }}
                    >
                      {upgrading ? '⏳ Redirection vers le paiement…' : `💳 Payer & postuler pour le niveau ${nextTier}`}
                    </button>
                  )}
                  {meetsRequirement && profile.name && !alreadyPending && (
                    <div style={{ marginTop: '0.6rem', color: '#666', fontSize: '0.78rem' }}>
                      Abonnement annuel — {nextTier === 'S2' ? '$399/an' : '$799/an'} · Paiement sécurisé par Stripe
                    </div>
                  )}
                  {!meetsRequirement && (
                    <div style={{ marginTop: '0.75rem', color: '#555', fontSize: '0.78rem' }}>
                      Il vous manque encore {requiredMissions - completedCount} mission(s) pour postuler.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
