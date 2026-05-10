import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Skeleton from '../components/Skeleton'

const LEVEL_COLORS = { 0: '#555', 1: '#CD7F32', 2: '#C0C0C0', 3: '#C9A84C' }
const LEVEL_LABELS = { 1: 'L1', 2: 'L2', 3: 'L3' }

// Trust score pill — shown only when score is available from the API
const TrustPill = ({ score }) => {
  if (score == null) return null
  const color = score >= 70 ? '#2ecc71' : score >= 40 ? '#f39c12' : '#ff6b6b'
  const bg    = score >= 70 ? 'rgba(46,204,113,0.1)' : score >= 40 ? 'rgba(243,156,18,0.1)' : 'rgba(231,76,60,0.1)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: bg, color, border: `1px solid ${color}44`, borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.68rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
      ◉ {score}
    </span>
  )
}

export default function TraderPortal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [level, setLevel] = useState(0)
  const [country, setCountry] = useState('')
  const [countries, setCountries] = useState([])
  const [user, setUser] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const role  = localStorage.getItem('role')
    if (!token) { navigate('/login'); return }
    if (role === 'pac') { navigate('/pac'); return }
    if (role === 'admin') { navigate('/admin'); return }
    const name  = localStorage.getItem('userName') || ''
    const email = localStorage.getItem('userEmail') || ''
    setUser({ name, email, role })
    document.title = 'Supplier Registry — MyDD'
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRegistry = useCallback(async (pg = 1) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: pg, limit: 20 })
      if (q)       params.set('q', q)
      if (level)   params.set('level', level)
      if (country) params.set('country', country)
      const res = await api.get(`/api/registry?${params}`)
      setCompanies(res.data.data)
      setTotal(res.data.pagination.total)
      setPages(res.data.pagination.pages)
      setPage(pg)
      // Build countries list from first load
      if (!country && !q && !level && pg === 1) {
        const res2 = await api.get('/api/registry?limit=200')
        const unique = [...new Set(res2.data.data.map(c => c.country).filter(Boolean))].sort()
        setCountries(unique)
      }
    } catch {
      setError(t('trader.error'))
    } finally { setLoading(false) }
  }, [q, level, country, t])

  useEffect(() => { fetchRegistry(1) }, [q, level, country]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    try { await api.post('/api/auth/logout', { refreshToken }) } catch { /* best-effort */ }
    localStorage.clear()
    navigate('/login')
  }

  const G = {
    page:    { minHeight: '100vh', background: '#111', fontFamily: 'sans-serif', color: '#eee' },
    nav:     { background: '#1a1a1a', borderBottom: '1px solid #333', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' },
    logo:    { color: '#C9A84C', fontWeight: '900', fontSize: '1.2rem', letterSpacing: '0.1em' },
    main:    { maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' },
    inp:     { padding: '0.65rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', outline: 'none' },
    sel:     { padding: '0.65rem 1rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' },
    btn:     { background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.55rem 1.1rem', borderRadius: '6px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.8rem' },
    outline: { background: 'transparent', color: '#C9A84C', padding: '0.55rem 1.1rem', borderRadius: '6px', border: '1px solid #C9A84C', fontWeight: '600', cursor: 'pointer', fontSize: '0.8rem' },
  }

  return (
    <div style={G.page}>
      <nav style={G.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '6px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '0.85rem', flexShrink: 0 }}>M</div>
          <div>
            <div style={{ color: '#fff', fontWeight: '800', fontSize: '1rem', letterSpacing: '-0.01em', lineHeight: 1.1 }}>MyDD</div>
            <div style={{ color: '#444', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('trader.portal_title')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <LanguageSwitcher />
          <span style={{ color: '#666', fontSize: '0.8rem' }}>{user?.name || user?.email}</span>
          <button onClick={handleLogout} style={{ ...G.outline, padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>{t('nav.logout')}</button>
        </div>
      </nav>

      <main style={G.main}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '0.25rem' }}>{t('trader.portal_title')}</div>
          <div style={{ color: '#666', fontSize: '0.875rem' }}>{t('trader.portal_subtitle')}</div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder={t('trader.search_placeholder')}
            style={{ ...G.inp, flex: '1', minWidth: '220px' }}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select style={G.sel} value={level} onChange={e => setLevel(parseInt(e.target.value, 10))}>
            <option value={0}>{t('trader.all_levels')}</option>
            <option value={1}>L1+</option>
            <option value={2}>L2+</option>
            <option value={3}>L3</option>
          </select>
          {countries.length > 0 && (
            <select style={G.sel} value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">{t('trader.all_countries')}</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <div style={{ color: '#555', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
            {!loading && `${total} ${t('trader.results_count')}`}
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: '#1a1a1a', border: '1px solid #222', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Skeleton height="3px" radius="2px" style={{ marginBottom: '0.25rem' }} />
                <Skeleton height="1rem" width="70%" />
                <Skeleton height="0.75rem" width="45%" />
                <Skeleton height="2rem" width="100%" style={{ marginTop: '0.5rem' }} />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#ff7f7f', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && companies.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.25 }}>🏭</div>
            <div style={{ color: '#ccc', fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              {t('trader.empty_title')}
            </div>
            <div style={{ color: '#555', fontSize: '0.875rem', maxWidth: '340px', margin: '0 auto 1.5rem' }}>
              {t('trader.empty_desc')}
            </div>
            <Link
              to="/dashboard"
              style={{ display: 'inline-block', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.65rem 1.5rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', textDecoration: 'none' }}
            >
              {t('trader.empty_cta')} →
            </Link>
          </div>
        )}

        {/* Company grid */}
        {!loading && companies.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {companies.map(c => {
              const lvlColor = LEVEL_COLORS[c.level] || '#555'
              return (
                <div key={c.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
                  {/* level accent */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg,${lvlColor},transparent)` }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: '700', fontSize: '1rem', color: '#fff', flex: 1, marginRight: '0.5rem' }}>{c.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      <TrustPill score={c.trustScore} />
                      <div style={{ background: `rgba(${lvlColor === '#C9A84C' ? '201,168,76' : lvlColor === '#C0C0C0' ? '192,192,192' : '205,127,50'},0.12)`, color: lvlColor, border: `1px solid ${lvlColor}44`, borderRadius: '20px', padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                        {t('trader.cert_level')} {c.level}
                      </div>
                    </div>
                  </div>

                  <div style={{ color: '#666', fontSize: '0.8rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {c.country && <span>📍 {c.country}</span>}
                    {c.sector  && <span>🏭 {c.sector}</span>}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                    <Link
                      to={`/verify/${c.id}`}
                      style={{ flex: 1, display: 'block', background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C44', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', textDecoration: 'none', textAlign: 'center' }}
                    >
                      {t('trader.view_cert')} →
                    </Link>
                    {c.website && (
                      <a
                        href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#444', border: '1px solid #2a2a2a', padding: '0.5rem 0.7rem', borderRadius: '6px', fontSize: '0.75rem', textDecoration: 'none' }}
                        title={c.website}
                      >
                        🌐
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Array.from({ length: pages }, (_, i) => i + 1).map(pg => (
              <button
                key={pg}
                onClick={() => fetchRegistry(pg)}
                style={{
                  padding: '0.5rem 0.9rem',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: pg === page ? '700' : '400',
                  background: pg === page ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#1f1f1f',
                  color: pg === page ? '#111' : '#888',
                  fontSize: '0.85rem',
                }}
              >
                {pg}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
