import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Skeleton from '../components/Skeleton'

const LEVEL_COLORS = { 0: '#555', 1: '#CD7F32', 2: '#C0C0C0', 3: '#C9A84C' }
const LEVEL_ICONS  = { 1: '◆', 2: '★', 3: '✔' }

const TrustPill = ({ score }) => {
  if (score == null) return null
  const color = score >= 70 ? '#2ecc71' : score >= 40 ? '#f39c12' : '#ff6b6b'
  const bg    = score >= 70 ? 'rgba(46,204,113,0.08)' : score >= 40 ? 'rgba(243,156,18,0.08)' : 'rgba(231,76,60,0.08)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: bg, color, border: `1px solid ${color}33`, borderRadius: '20px', padding: '0.15rem 0.55rem', fontSize: '0.68rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
      ◉ {score}
    </span>
  )
}

export default function PublicRegistry() {
  const { t } = useTranslation()
  const [companies, setCompanies] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [q, setQ]                 = useState('')

  useEffect(() => {
    const BASE = 'https://mydd.work'
    document.title = 'MyDD — Certified Supplier Directory'
    ;[
      ['meta[name="description"]',        { name: 'description',        content: 'Browse and verify certified suppliers on MyDD. Instant due-diligence verification for global trade.' }],
      ['meta[property="og:type"]',        { property: 'og:type',        content: 'website' }],
      ['meta[property="og:url"]',         { property: 'og:url',         content: `${BASE}/registry` }],
      ['meta[property="og:title"]',       { property: 'og:title',       content: 'MyDD — Certified Suppliers' }],
      ['meta[property="og:description"]', { property: 'og:description', content: 'Verified suppliers for global trade. Browse B&E-certified companies across all industries.' }],
    ].forEach(([sel, attrs]) => {
      let el = document.querySelector(sel)
      if (!el) { el = document.createElement('meta'); document.head.appendChild(el) }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    })
  }, [])
  const [level, setLevel]         = useState(0)
  const [country, setCountry]     = useState('')
  const [countries, setCountries] = useState([])

  // Pre-load country list once
  useEffect(() => {
    api.get('/api/registry?limit=200').then(res => {
      const unique = [...new Set(res.data.data.map(c => c.country).filter(Boolean))].sort()
      setCountries(unique)
    }).catch(() => {})
  }, [])

  const fetchRegistry = useCallback(async (pg = 1) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: pg, limit: 18 })
      if (q)       params.set('q', q)
      if (level)   params.set('level', level)
      if (country) params.set('country', country)
      const res = await api.get(`/api/registry?${params}`)
      setCompanies(res.data.data)
      setTotal(res.data.pagination.total)
      setPages(res.data.pagination.pages)
      setPage(pg)
    } catch { setError(t('trader.error')) }
    finally { setLoading(false) }
  }, [q, level, country, t])

  useEffect(() => { fetchRegistry(1) }, [q, level, country]) // eslint-disable-line

  // SEO title
  useEffect(() => { document.title = 'MyDD — Certified Supplier Search' }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', fontFamily: 'Inter,sans-serif', color: '#eee' }}>

      {/* Top nav */}
      <nav style={{ background: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1f1f1f', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
          <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '7px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111' }}>M</div>
          <div style={{ color: '#C9A84C', fontWeight: '800', fontSize: '1rem', letterSpacing: '-0.01em' }}>MyDD</div>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <LanguageSwitcher />
          <Link to="/login" style={{ color: '#888', fontSize: '0.85rem', textDecoration: 'none', border: '1px solid #2a2a2a', padding: '0.45rem 1rem', borderRadius: '6px' }}>{t('nav.login')}</Link>
          <Link to="/register" style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', fontSize: '0.85rem', textDecoration: 'none', padding: '0.45rem 1.1rem', borderRadius: '6px', fontWeight: '700' }}>{t('landing.cta_start')}</Link>
        </div>
      </nav>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1.5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '20px', padding: '0.3rem 0.9rem', marginBottom: '1rem' }}>
            <span style={{ color: '#C9A84C', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t('nav.registry')}</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: '900', color: '#fff', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>{t('trader.portal_title')}</h1>
          <p style={{ color: '#555', fontSize: '0.95rem', maxWidth: '500px', margin: '0 auto' }}>{t('trader.portal_subtitle')}</p>
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center', justifyContent: 'center' }}>
          <input
            type="text"
            placeholder={t('trader.search_placeholder')}
            style={{ flex: '1', minWidth: '260px', maxWidth: '460px', padding: '0.75rem 1.1rem', background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select
            style={{ padding: '0.75rem 1rem', background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', color: q || level || country ? '#fff' : '#666', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
            value={level}
            onChange={e => setLevel(parseInt(e.target.value, 10))}
          >
            <option value={0}>{t('trader.all_levels')}</option>
            <option value={1}>L1+</option>
            <option value={2}>L2+</option>
            <option value={3}>L3 Gold</option>
          </select>
          {countries.length > 0 && (
            <select
              style={{ padding: '0.75rem 1rem', background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', color: country ? '#fff' : '#666', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
              value={country}
              onChange={e => setCountry(e.target.value)}
            >
              <option value="">{t('trader.all_countries')}</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Stats bar */}
        <div style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', marginBottom: '2rem' }}>
          {!loading && `${total} ${t('trader.results_count')}`}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <Skeleton height="2px" radius="2px" />
                <Skeleton height="1rem" width="65%" />
                <Skeleton height="0.75rem" width="40%" />
                <Skeleton height="2.25rem" width="100%" style={{ marginTop: '0.5rem' }} />
              </div>
            ))}
          </div>
        )}

        {error && <div style={{ color: '#ff7f7f', padding: '1rem', textAlign: 'center' }}>{error}</div>}

        {/* Empty state */}
        {!loading && !error && companies.length === 0 && (
          <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem', opacity: 0.2 }}>🔍</div>
            <div style={{ color: '#ccc', fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              {t('trader.empty_title')}
            </div>
            <div style={{ color: '#444', fontSize: '0.875rem', maxWidth: '380px', margin: '0 auto 1.75rem', lineHeight: 1.6 }}>
              {t('trader.empty_desc')}
            </div>
            <Link
              to="/register"
              style={{ display: 'inline-block', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.7rem 1.75rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', textDecoration: 'none' }}
            >
              {t('trader.empty_cta')} →
            </Link>
          </div>
        )}

        {/* Grid */}
        {!loading && companies.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
            {companies.map(c => {
              const lvlColor = LEVEL_COLORS[c.level] || '#555'
              const lvlIcon  = LEVEL_ICONS[c.level]  || '○'
              return (
                <div key={c.id} style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '14px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,${lvlColor}88,transparent)` }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ fontWeight: '700', fontSize: '1rem', color: '#fff', flex: 1, lineHeight: 1.3 }}>{c.name}</div>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <TrustPill score={c.trustScore} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: `rgba(0,0,0,0.4)`, border: `1px solid ${lvlColor}44`, borderRadius: '20px', padding: '0.2rem 0.65rem', fontSize: '0.7rem', fontWeight: '800', color: lvlColor }}>
                        <span>{lvlIcon}</span>
                        <span>L{c.level}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {c.country && <span style={{ color: '#555', fontSize: '0.8rem' }}>📍 {c.country}</span>}
                    {c.sector  && <span style={{ color: '#555', fontSize: '0.8rem' }}>🏭 {c.sector}</span>}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <Link
                      to={`/verify/${c.id}`}
                      style={{ flex: 1, display: 'block', textAlign: 'center', padding: '0.55rem', borderRadius: '8px', border: `1px solid ${lvlColor}33`, color: lvlColor, textDecoration: 'none', fontSize: '0.8rem', fontWeight: '600', background: `${lvlColor}08` }}
                    >
                      {t('trader.view_cert')} →
                    </Link>
                    {c.website && (
                      <a
                        href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid #1f1f1f', color: '#333', textDecoration: 'none', fontSize: '0.75rem' }}
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
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '3rem' }}>
            {Array.from({ length: pages }, (_, i) => i + 1).map(pg => (
              <button key={pg} onClick={() => fetchRegistry(pg)} style={{
                padding: '0.5rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                background: pg === page ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#141414',
                color: pg === page ? '#111' : '#555', fontWeight: pg === page ? '700' : '400',
              }}>{pg}</button>
            ))}
          </div>
        )}

        {/* CTA for unauthenticated buyers */}
        <div style={{ background: 'linear-gradient(135deg,rgba(201,168,76,0.08),rgba(0,0,0,0))', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '16px', padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', marginBottom: '0.5rem' }}>{t('landing.cta_banner.title')}</div>
          <div style={{ color: '#555', fontSize: '0.875rem', marginBottom: '1.5rem' }}>{t('landing.cta_banner.subtitle')}</div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', textDecoration: 'none', padding: '0.7rem 1.5rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.9rem' }}>
              {t('landing.cta_start')}
            </Link>
            <Link to="/login" style={{ background: 'transparent', color: '#C9A84C', textDecoration: 'none', padding: '0.65rem 1.4rem', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', border: '1px solid #C9A84C44' }}>
              {t('landing.cta_login')}
            </Link>
          </div>
        </div>
      </main>

      <footer style={{ borderTop: '1px solid #111', padding: '1.5rem 2rem', textAlign: 'center', color: '#2a2a2a', fontSize: '0.75rem' }}>
        © {new Date().getFullYear()} B&amp;E Consult FZCO · Dubai Silicon Oasis, UAE
        {' · '}
        <Link to="/terms" style={{ color: '#333', textDecoration: 'none' }}>CGU</Link>
        {' · '}
        <Link to="/privacy" style={{ color: '#333', textDecoration: 'none' }}>Privacy Policy</Link>
      </footer>
    </div>
  )
}
