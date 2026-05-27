'use strict'
import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Skeleton from '../components/Skeleton'

const TIER_META = {
  S1: { label: 'S1 Associate', color: '#4a90e2', bg: 'rgba(74,144,226,0.1)',  desc: 'Auditeur Associé' },
  S2: { label: 'S2 Certified', color: '#C9A84C', bg: 'rgba(201,168,76,0.1)', desc: 'Auditeur Certifié' },
  S3: { label: 'S3 Senior',    color: '#e056fd', bg: 'rgba(224,86,253,0.1)', desc: 'Expert Senior' },
}

function Stars({ value, color, size = '0.85rem' }) {
  if (value == null) return null
  return (
    <span style={{ display: 'inline-flex', gap: '1px', alignItems: 'center' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ color: i < Math.round(value) ? color : '#222', fontSize: size }}>★</span>
      ))}
      <span style={{ color, fontSize: '0.72rem', fontWeight: '700', marginLeft: '0.35rem' }}>{value.toFixed(1)}</span>
    </span>
  )
}

export default function PACAgentProfile() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const [agent, setAgent]   = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/api/pac/directory/${id}`)
        setAgent(res.data.agent)
        setHistory(res.data.missionHistory)

        // SEO
        const a = res.data.agent
        const name = a.name || 'Expert PAC'
        const tm   = TIER_META[a.tier] || TIER_META.S1
        document.title = `${name} — ${tm.desc} B&E Certified | MyDD`
        ;[
          ['meta[name="description"]', { name: 'description', content: `${name}, ${tm.desc} certifié B&E. ${a.location ? `Basé à ${a.location}. ` : ''}${a.missionsCompleted} missions complétées. Expertise : ${a.expertise || 'due diligence, supply chain'}.` }],
          ['meta[property="og:title"]', { property: 'og:title', content: `${name} — ${tm.label} PAC` }],
          ['meta[property="og:url"]',   { property: 'og:url',   content: `https://mydd.work/agents/${id}` }],
        ].forEach(([sel, attrs]) => {
          let el = document.querySelector(sel)
          if (!el) { el = document.createElement('meta'); document.head.appendChild(el) }
          Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
        })
      } catch (err) {
        if (err?.response?.status === 404) navigate('/agents', { replace: true })
        else setError(t('agents.profile.error_load'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const tm = agent ? (TIER_META[agent.tier] || TIER_META.S1) : TIER_META.S1
  const onTimePct = agent && agent.missionsCompleted > 0
    ? Math.round((agent.missionsOnTime / agent.missionsCompleted) * 100)
    : null

  // Outcome label from i18n
  const outcomeLabel = (key) => {
    if (key === 'pass')        return t('agents.profile.outcome_pass')
    if (key === 'fail')        return t('agents.profile.outcome_fail')
    if (key === 'conditional') return t('agents.profile.outcome_cond')
    return '—'
  }
  const OUTCOME_COLOR = {
    pass:        { color: '#2ecc71', bg: 'rgba(46,204,113,0.1)'  },
    fail:        { color: '#ff6b6b', bg: 'rgba(231,76,60,0.1)'   },
    conditional: { color: '#f39c12', bg: 'rgba(243,156,18,0.1)'  },
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', color: '#eee', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Nav */}
      <nav className="pac-nav" style={{ borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'rgba(13,13,13,0.97)', backdropFilter: 'blur(8px)', zIndex: 50 }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: '900', fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#eee' }}>B&E</span>
          <span style={{ color: '#C9A84C', fontWeight: '700', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>PAC Network</span>
        </Link>
        <div className="pac-nav-links">
          <Link to="/agents" className="pac-nav-secondary" style={{ color: '#555', fontSize: '0.82rem', textDecoration: 'none' }}>{t('agents.profile.back')}</Link>
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="pac-page" style={{ maxWidth: '860px', margin: '0 auto', paddingBottom: '4rem' }}>

        {error && (
          <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '10px', padding: '1rem 1.25rem', color: '#ff6b6b', marginBottom: '1.5rem' }}>{error}</div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Skeleton style={{ height: '200px', borderRadius: '16px' }} />
            <Skeleton style={{ height: '120px', borderRadius: '12px' }} />
            <Skeleton style={{ height: '300px', borderRadius: '12px' }} />
          </div>
        ) : agent && (
          <>
            {/* ── Hero card ── */}
            <div className="profile-hero" style={{ background: '#111', border: `1px solid ${tm.color}33`, borderRadius: '20px', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg,${tm.color},transparent)` }} />

              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Avatar */}
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: tm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', border: `2px solid ${tm.color}44`, flexShrink: 0 }}>
                  👤
                </div>

                <div style={{ flex: 1, minWidth: '180px' }}>
                  {/* Name + badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <h1 style={{ margin: 0, fontSize: 'clamp(1.2rem, 3vw, 1.6rem)', fontWeight: '900', color: '#eee' }}>
                      {agent.name || 'Expert PAC'}
                    </h1>
                    <span style={{ background: tm.bg, color: tm.color, fontSize: '0.7rem', fontWeight: '800', padding: '0.2rem 0.6rem', borderRadius: '5px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {tm.label}
                    </span>
                    <span style={{ background: 'rgba(46,204,113,0.08)', color: '#2ecc71', fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '5px', letterSpacing: '0.06em', border: '1px solid rgba(46,204,113,0.2)' }}>
                      {t('agents.profile.kyc_verified')}
                    </span>
                  </div>

                  {/* Location + member since */}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                    {agent.location && <span style={{ color: '#555', fontSize: '0.82rem' }}>📍 {agent.location}</span>}
                    {agent.memberSince && (
                      <span style={{ color: '#333', fontSize: '0.78rem' }}>
                        {t('agents.profile.member_since')} {new Date(agent.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                      </span>
                    )}
                    {agent.promotedS3 && (
                      <span style={{ color: tm.color, fontSize: '0.78rem', fontWeight: '600' }}>
                        {t('agents.profile.promoted_since_s3')} {new Date(agent.promotedS3).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>

                  {/* Bio */}
                  {agent.bio && (
                    <p style={{ color: '#888', fontSize: '0.88rem', lineHeight: 1.65, margin: '0 0 1rem' }}>{agent.bio}</p>
                  )}

                  {/* Expertise + languages + certs */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {agent.expertise && agent.expertise.split(',').map(e => (
                      <span key={e.trim()} style={{ background: '#1a1a1a', border: '1px solid #252525', color: '#777', fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '5px' }}>
                        {e.trim()}
                      </span>
                    ))}
                    {agent.languages && agent.languages.split(',').map(l => (
                      <span key={l.trim()} style={{ background: '#1a1a1a', border: '1px solid #252525', color: '#555', fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '5px' }}>
                        🌐 {l.trim()}
                      </span>
                    ))}
                    {agent.certifications && agent.certifications.split(',').map(c => (
                      <span key={c.trim()} style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', color: '#C9A84C', fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '5px' }}>
                        🏆 {c.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Stats row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {[
                { label: t('agents.profile.stat_missions'), value: agent.missionsCompleted, color: tm.color },
                { label: t('agents.profile.stat_l2'),       value: agent.l2MissionsCompleted || 0, color: '#4a90e2' },
                { label: t('agents.profile.stat_ontime'),   value: onTimePct !== null ? `${onTimePct}%` : '—', color: onTimePct >= 80 ? '#2ecc71' : onTimePct >= 60 ? '#f39c12' : '#ff6b6b', raw: true },
              ].map(item => (
                <div key={item.label} style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '1.1rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,${item.color},transparent)` }} />
                  <div style={{ color: '#333', fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>{item.label}</div>
                  <div style={{ color: item.color, fontSize: '1.7rem', fontWeight: '900', lineHeight: 1 }}>{item.value}</div>
                </div>
              ))}

              {agent.avgClientScore != null && (
                <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '1.1rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,#C9A84C,transparent)' }} />
                  <div style={{ color: '#333', fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{t('agents.profile.stat_client')}</div>
                  <Stars value={agent.avgClientScore} color="#C9A84C" size="1rem" />
                </div>
              )}
              {agent.avgAdminScore != null && (
                <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '12px', padding: '1.1rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,#e056fd,transparent)' }} />
                  <div style={{ color: '#333', fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>{t('agents.profile.stat_admin')}</div>
                  <Stars value={agent.avgAdminScore} color="#e056fd" size="1rem" />
                </div>
              )}
            </div>

            {/* ── Mission history (anonymised) ── */}
            {history.length > 0 && (
              <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '14px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.88rem' }}>{t('agents.profile.history_title')}</div>
                  <span style={{ color: '#333', fontSize: '0.72rem' }}>{t('agents.profile.history_count', { n: history.length })}</span>
                </div>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '600px' }}>
                    <thead>
                      <tr>
                        {[
                          t('agents.profile.col_type'),
                          t('agents.profile.col_zone'),
                          t('agents.profile.col_tier'),
                          t('agents.profile.col_outcome'),
                          t('agents.profile.col_client'),
                          t('agents.profile.col_admin'),
                          t('agents.profile.col_delay'),
                          t('agents.profile.col_date'),
                        ].map(h => (
                          <th key={h} style={{ padding: '0.6rem 1rem', color: '#333', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.08em', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #1a1a1a' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((m, i) => {
                        const oc = OUTCOME_COLOR[m.outcome] || null
                        const tierColor = (TIER_META[m.tierRequired] || TIER_META.S1).color
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #141414' }}>
                            <td style={{ padding: '0.65rem 1rem', color: '#888' }}>{m.type || '—'}</td>
                            <td style={{ padding: '0.65rem 1rem', color: '#666' }}>{m.location || '—'}</td>
                            <td style={{ padding: '0.65rem 1rem' }}>
                              <span style={{ color: tierColor, fontWeight: '700', fontSize: '0.7rem' }}>{m.tierRequired}</span>
                            </td>
                            <td style={{ padding: '0.65rem 1rem' }}>
                              {oc ? (
                                <span style={{ background: oc.bg, color: oc.color, fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>{outcomeLabel(m.outcome)}</span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '0.65rem 1rem' }}>
                              {m.clientScore ? <Stars value={m.clientScore} color="#C9A84C" size="0.7rem" /> : <span style={{ color: '#2a2a2a' }}>—</span>}
                            </td>
                            <td style={{ padding: '0.65rem 1rem' }}>
                              {m.adminScore ? <Stars value={m.adminScore} color="#e056fd" size="0.7rem" /> : <span style={{ color: '#2a2a2a' }}>—</span>}
                            </td>
                            <td style={{ padding: '0.65rem 1rem' }}>
                              {m.onTime === true
                                ? <span style={{ color: '#2ecc71', fontSize: '0.7rem', fontWeight: '700' }}>{t('agents.profile.ontime_yes')}</span>
                                : m.onTime === false
                                  ? <span style={{ color: '#ff6b6b', fontSize: '0.7rem' }}>{t('agents.profile.ontime_late')}</span>
                                  : <span style={{ color: '#2a2a2a' }}>—</span>}
                            </td>
                            <td style={{ padding: '0.65rem 1rem', color: '#444', whiteSpace: 'nowrap' }}>
                              {m.completedAt ? new Date(m.completedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── CTA ── */}
            <div className="profile-cta" style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: '14px', padding: '1.5rem 2rem' }}>
              <div>
                <div style={{ fontWeight: '700', color: '#eee', marginBottom: '0.3rem' }}>{t('agents.profile.cta_title')}</div>
                <div style={{ color: '#555', fontSize: '0.82rem' }}>{t('agents.profile.cta_desc', { name: agent.name?.split(' ')[0] || 'cet expert' })}</div>
              </div>
              <div className="profile-cta-btns">
                <Link to="/agents" style={{ background: '#1a1a1a', border: '1px solid #252525', color: '#888', borderRadius: '8px', padding: '0.6rem 1.2rem', textDecoration: 'none', fontSize: '0.82rem' }}>
                  {t('agents.profile.cta_agents')}
                </Link>
                <Link to="/register" style={{ background: 'linear-gradient(135deg,#C9A84C,#a8863c)', color: '#000', borderRadius: '8px', padding: '0.6rem 1.2rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: '700' }}>
                  {t('agents.profile.cta_register')}
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
