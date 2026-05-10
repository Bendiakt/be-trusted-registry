import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'

const OUTCOME_COLORS = {
  pass:        { bg: 'rgba(46,204,113,0.12)',  border: 'rgba(46,204,113,0.4)',  text: '#2ecc71' },
  fail:        { bg: 'rgba(231,76,60,0.12)',   border: 'rgba(231,76,60,0.4)',   text: '#ff6b6b' },
  conditional: { bg: 'rgba(243,156,18,0.12)',  border: 'rgba(243,156,18,0.4)',  text: '#f39c12' },
}

export default function PACPortal() {
  const { t } = useTranslation()
  const [missions, setMissions]         = useState([])
  const [profile, setProfile]           = useState({ name: '', location: '', languages: '', certifications: '', bio: '' })
  const [msg, setMsg]                   = useState({ text: '', type: '' })
  const [tab, setTab]                   = useState('missions')
  const [reportForms, setReportForms]   = useState({})   // { [missionId]: { open, text, outcome, submitting } }
  const navigate = useNavigate()

  useEffect(() => {
    const role = localStorage.getItem('role')
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    if (role && role !== 'pac') { navigate(role === 'admin' ? '/admin' : '/dashboard'); return }

    api.get('/api/pac/missions')
      .then(res => setMissions(res.data)).catch(() => {})
    api.get('/api/pac/profile')
      .then(res => { if (res.data && Object.keys(res.data).length > 0) setProfile(p => ({ ...p, ...res.data })) })
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

  const toggleReportForm = (id) => {
    setReportForms(prev => ({
      ...prev,
      [id]: prev[id]?.open
        ? { ...prev[id], open: false }
        : { open: true, text: '', outcome: 'pass', submitting: false },
    }))
  }

  const submitReport = async (mission) => {
    const form = reportForms[mission.id]
    if (!form?.text?.trim()) return
    setReportForms(prev => ({ ...prev, [mission.id]: { ...prev[mission.id], submitting: true } }))
    try {
      await api.post(`/api/pac/missions/${mission.id}/complete`, {
        report_text: form.text,
        outcome:     form.outcome,
      })
      setMsg({ text: t('pac.missions.mission_completed'), type: 'success' })
      setMissions(prev => prev.map(m => m.id === mission.id
        ? { ...m, status: 'completed', reportText: form.text, outcome: form.outcome }
        : m
      ))
      setReportForms(prev => ({ ...prev, [mission.id]: { open: false } }))
    } catch {
      setMsg({ text: t('pac.missions.error_complete'), type: 'error' })
      setReportForms(prev => ({ ...prev, [mission.id]: { ...prev[mission.id], submitting: false } }))
    }
  }

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    try { await api.post('/api/auth/logout', { refreshToken }) } catch { /* best-effort */ }
    localStorage.clear()
    navigate('/login')
  }

  const TABS = [
    { id: 'missions', label: t('pac.tabs.missions') },
    { id: 'profile',  label: t('pac.tabs.profile') },
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

                          <div style={{ marginBottom: '1rem' }}>
                            <label style={lbl}>{t('pac.missions.report_text')}</label>
                            <textarea rows={4} placeholder={t('pac.missions.report_text_placeholder')}
                              style={{ ...inp, resize: 'vertical' }}
                              value={rf.text || ''}
                              onChange={e => setReportForms(prev => ({ ...prev, [m.id]: { ...prev[m.id], text: e.target.value } }))}
                            />
                          </div>

                          <button
                            onClick={() => submitReport(m)}
                            disabled={rf.submitting || !rf.text?.trim()}
                            style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.7rem 1.75rem', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: rf.submitting || !rf.text?.trim() ? 'default' : 'pointer', fontSize: '0.875rem', opacity: rf.submitting || !rf.text?.trim() ? 0.6 : 1 }}>
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
      </div>
    </div>
  )
}
