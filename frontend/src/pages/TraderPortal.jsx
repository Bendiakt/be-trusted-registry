import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Skeleton from '../components/Skeleton'

const LEVEL_COLORS = { 0: '#555', 1: '#CD7F32', 2: '#C0C0C0', 3: '#C9A84C' }

const TrustPill = ({ score }) => {
  if (score == null) return null
  const color = score >= 70 ? '#2ecc71' : score >= 40 ? '#f39c12' : '#ff6b6b'
  const bg    = score >= 70 ? 'rgba(46,204,113,0.1)' : score >= 40 ? 'rgba(243,156,18,0.1)' : 'rgba(231,76,60,0.1)'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', background:bg, color, border:`1px solid ${color}44`, borderRadius:'20px', padding:'0.15rem 0.55rem', fontSize:'0.68rem', fontWeight:'700', whiteSpace:'nowrap' }}>
      ◉ {score}
    </span>
  )
}

const ExpiryBadge = ({ expiresAt }) => {
  if (!expiresAt) return null
  const days = Math.ceil((new Date(expiresAt) - Date.now()) / 86400000)
  if (days > 30) return null
  const color = days <= 7 ? '#ff6b6b' : '#f39c12'
  const bg    = days <= 7 ? 'rgba(231,76,60,0.12)' : 'rgba(243,156,18,0.12)'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', background:bg, color, border:`1px solid ${color}44`, borderRadius:'20px', padding:'0.15rem 0.55rem', fontSize:'0.68rem', fontWeight:'700', whiteSpace:'nowrap' }}>
      ⚠ {days}d
    </span>
  )
}

export default function TraderPortal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // ── state ──────────────────────────────────────────────────────────────────
  const [tab, setTab]               = useState('registry') // 'registry' | 'watchlist'
  const [companies, setCompanies]   = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [pages, setPages]           = useState(1)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [q, setQ]                   = useState('')
  const [level, setLevel]           = useState(0)
  const [country, setCountry]       = useState('')
  const [countries, setCountries]   = useState([])
  const [user, setUser]             = useState(null)
  const [watchedIds, setWatchedIds] = useState(new Set())
  const [togglingId, setTogglingId] = useState(null)
  const [stats, setStats]           = useState(null)
  const [exporting, setExporting]       = useState(false)
  const [subscribed, setSubscribed]     = useState(true)   // optimistic — set false on 402
  const [subSuccess, setSubSuccess]     = useState(false)  // shown after Stripe redirect
  const [checkingOut, setCheckingOut]   = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('annual') // 'monthly' | 'annual'
  const countriesLoaded                 = useRef(false)

  // ── auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = getSession()
    if (!user)             { navigate('/login'); return }
    if (user.role === 'pac') { navigate('/pac'); return }
    // admin and trader are both allowed — RoleRoute in App.jsx already enforces this
    setUser({ name: user.name, email: user.email, role: user.role })
    document.title = 'Supplier Registry — MyDD'
    if (searchParams.get('subscription') === 'success') {
      setSubscribed(true)
      setSubSuccess(true)
      setTimeout(() => setSubSuccess(false), 8000)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stripe trader checkout ─────────────────────────────────────────────────
  const startCheckout = async () => {
    setCheckingOut(true)
    try {
      const planId = selectedPlan === 'annual' ? 'trader_annual' : 'trader_monthly'
      const res = await api.post('/api/payments/trader-checkout', { planId })
      window.location.href = res.data.url
    } catch (e) {
      setCheckingOut(false)
    }
  }

  // ── fetch watchlist ids (lightweight — just ids for star state) ────────────
  const fetchWatchedIds = useCallback(async () => {
    try {
      const res = await api.get('/api/trader/watchlist?limit=1000')
      setWatchedIds(new Set(res.data.data.map(c => c.id)))
    } catch (e) {
      if (e.response?.status === 402) setSubscribed(false)
    }
  }, [])

  // ── fetch stats ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/api/trader/stats')
      setStats(res.data)
    } catch (e) {
      if (e.response?.status === 402) setSubscribed(false)
    }
  }, [])

  useEffect(() => {
    fetchWatchedIds()
    fetchStats()
  }, [fetchWatchedIds, fetchStats])

  // ── fetch registry (public) ────────────────────────────────────────────────
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
      if (!countriesLoaded.current) {
        const res2 = await api.get('/api/registry?limit=300')
        setCountries([...new Set(res2.data.data.map(c => c.country).filter(Boolean))].sort())
        countriesLoaded.current = true
      }
    } catch { setError(t('trader.error')) }
    finally  { setLoading(false) }
  }, [q, level, country, t])

  // ── fetch watchlist (full, with cert status) ───────────────────────────────
  const fetchWatchlist = useCallback(async (pg = 1) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: pg, limit: 20 })
      if (q) params.set('q', q)
      const res = await api.get(`/api/trader/watchlist?${params}`)
      setCompanies(res.data.data)
      setTotal(res.data.pagination.total)
      setPages(res.data.pagination.pages)
      setPage(pg)
    } catch { setError(t('trader.error')) }
    finally  { setLoading(false) }
  }, [q, t])

  useEffect(() => {
    if (tab === 'registry') fetchRegistry(1)
    else                    fetchWatchlist(1)
  }, [tab, q, level, country]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── toggle watchlist membership ────────────────────────────────────────────
  const toggleWatch = async (companyId) => {
    if (togglingId) return
    setTogglingId(companyId)
    try {
      const isWatched = watchedIds.has(companyId)
      if (isWatched) {
        await api.delete(`/api/trader/watchlist/${companyId}`)
        setWatchedIds(prev => { const s = new Set(prev); s.delete(companyId); return s })
        if (tab === 'watchlist') {
          setCompanies(prev => prev.filter(c => c.id !== companyId))
          setTotal(prev => Math.max(0, prev - 1))
        }
      } else {
        await api.post(`/api/trader/watchlist/${companyId}`)
        setWatchedIds(prev => new Set([...prev, companyId]))
      }
      fetchStats()
    } catch { /* silent */ }
    finally { setTogglingId(null) }
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const res = await api.get('/api/trader/watchlist/export', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `watchlist-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
    finally { setExporting(false) }
  }

  // ── logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try { await api.post('/api/auth/logout') } catch { /* best-effort */ }
    clearSession()
    navigate('/login')
  }

  // ── styles ─────────────────────────────────────────────────────────────────
  const G = {
    page:    { minHeight:'100vh', background:'#111', fontFamily:'sans-serif', color:'#eee' },
    nav:     { background:'#1a1a1a', borderBottom:'1px solid #333', padding:'0 2rem', display:'flex', alignItems:'center', justifyContent:'space-between', height:'60px' },
    main:    { maxWidth:'1100px', margin:'0 auto', padding:'2rem 1.5rem' },
    inp:     { padding:'0.65rem 1rem', background:'#1f1f1f', border:'1px solid #2e2e2e', borderRadius:'8px', color:'#fff', fontSize:'0.9rem', outline:'none' },
    sel:     { padding:'0.65rem 1rem', background:'#1f1f1f', border:'1px solid #2e2e2e', borderRadius:'8px', color:'#fff', fontSize:'0.85rem', outline:'none', cursor:'pointer' },
    btn:     { background:'linear-gradient(135deg,#C9A84C,#9A7B2E)', color:'#111', padding:'0.55rem 1.1rem', borderRadius:'6px', border:'none', fontWeight:'700', cursor:'pointer', fontSize:'0.8rem' },
    outline: { background:'transparent', color:'#C9A84C', padding:'0.55rem 1.1rem', borderRadius:'6px', border:'1px solid #C9A84C', fontWeight:'600', cursor:'pointer', fontSize:'0.8rem' },
    tab:     (active) => ({ padding:'0.5rem 1.2rem', borderRadius:'6px', border:'none', cursor:'pointer', fontWeight:active?'700':'400', background:active?'linear-gradient(135deg,#C9A84C,#9A7B2E)':'#1f1f1f', color:active?'#111':'#888', fontSize:'0.85rem', transition:'all 0.15s' }),
    stat:    { background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.25rem' },
  }

  const lvlLabel = (l) => l > 0 ? `L${l}` : '—'

  const renderCard = (c) => {
    const lvlColor  = LEVEL_COLORS[c.level] || '#555'
    const isWatched = watchedIds.has(c.id)
    const isExpiring = c.expires_at && new Date(c.expires_at) < new Date(Date.now() + 30 * 86400000)
    return (
      <div key={c.id} style={{ background:'#1a1a1a', border:`1px solid ${isExpiring && isWatched ? 'rgba(243,156,18,0.3)' : '#2a2a2a'}`, borderRadius:'12px', padding:'1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:`linear-gradient(90deg,${lvlColor},transparent)` }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ fontWeight:'700', fontSize:'1rem', color:'#fff', flex:1, marginRight:'0.5rem' }}>{c.name}</div>
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexShrink:0 }}>
            <TrustPill score={c.trust_score ?? c.trustScore} />
            <ExpiryBadge expiresAt={c.expires_at} />
            {c.level > 0 && (
              <div style={{ background:`rgba(201,168,76,0.12)`, color:lvlColor, border:`1px solid ${lvlColor}44`, borderRadius:'20px', padding:'0.2rem 0.6rem', fontSize:'0.7rem', fontWeight:'700', whiteSpace:'nowrap' }}>
                {lvlLabel(c.level)}
              </div>
            )}
          </div>
        </div>
        <div style={{ color:'#666', fontSize:'0.8rem', display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
          {c.country && <span>📍 {c.country}</span>}
          {c.sector  && <span>🏭 {c.sector}</span>}
          {tab === 'watchlist' && c.expires_at && (
            <span style={{ color: isExpiring ? '#f39c12' : '#555' }}>
              📅 exp. {new Date(c.expires_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:'0.5rem', marginTop:'auto', flexWrap:'wrap', alignItems:'center' }}>
          <Link
            to={`/verify/${c.id}`}
            style={{ flex:1, display:'block', background:'transparent', color:'#C9A84C', border:'1px solid #C9A84C44', padding:'0.5rem 0.75rem', borderRadius:'6px', fontSize:'0.8rem', fontWeight:'600', textDecoration:'none', textAlign:'center' }}
          >
            {t('trader.view_cert')} →
          </Link>
          {c.website && (
            <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer"
               style={{ display:'flex', alignItems:'center', justifyContent:'center', background:'transparent', color:'#444', border:'1px solid #2a2a2a', padding:'0.5rem 0.7rem', borderRadius:'6px', fontSize:'0.75rem', textDecoration:'none' }}
               title={c.website}>🌐</a>
          )}
          <button
            onClick={() => toggleWatch(c.id)}
            disabled={togglingId === c.id}
            title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', background: isWatched ? 'rgba(201,168,76,0.12)' : 'transparent', color: isWatched ? '#C9A84C' : '#555', border:`1px solid ${isWatched ? '#C9A84C44' : '#2a2a2a'}`, padding:'0.5rem 0.7rem', borderRadius:'6px', fontSize:'0.85rem', cursor:'pointer', transition:'all 0.15s' }}
          >
            {isWatched ? '★' : '☆'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={G.page}>
      {/* Nav */}
      <nav style={G.nav}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem' }}>
          <div style={{ background:'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius:'6px', width:'30px', height:'30px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'900', color:'#111', fontSize:'0.85rem', flexShrink:0 }}>M</div>
          <div>
            <div style={{ color:'#fff', fontWeight:'800', fontSize:'1rem', lineHeight:1.1 }}>MyDD</div>
            <div style={{ color:'#444', fontSize:'0.6rem', letterSpacing:'0.1em', textTransform:'uppercase' }}>{t('trader.portal_title')}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <LanguageSwitcher />
          <span style={{ color:'#666', fontSize:'0.8rem' }}>{user?.name || user?.email}</span>
          <button onClick={handleLogout} style={{ ...G.outline, padding:'0.4rem 0.9rem', fontSize:'0.8rem' }}>{t('nav.logout')}</button>
        </div>
      </nav>

      <main style={G.main}>
        {/* ── Paywall — shown when subscription is inactive ── */}
        {!subscribed && (
          <div style={{ maxWidth: 560, margin: '4rem auto', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 16, padding: '3rem 2.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
              Accès Trader Portal
            </div>
            <div style={{ color: '#777', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '2rem' }}>
              Accédez au registre complet des fournisseurs certifiés, à votre watchlist avec alertes d'expiration, et aux exports CSV.
            </div>

            {/* Plan selector */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
              {[
                { id: 'monthly', label: 'Mensuel', price: '$49/mois', sub: 'Sans engagement' },
                { id: 'annual',  label: 'Annuel',  price: '$499/an',  sub: '2 mois offerts ✦' },
              ].map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  style={{ flex: 1, padding: '1rem', borderRadius: 10, cursor: 'pointer', border: selectedPlan === p.id ? '1.5px solid #C9A84C' : '1px solid #2a2a2a', background: selectedPlan === p.id ? 'rgba(201,168,76,0.08)' : '#111', position: 'relative' }}
                >
                  {p.id === 'annual' && (
                    <div style={{ position: 'absolute', top: -10, right: 10, background: '#C9A84C', color: '#111', fontSize: '0.6rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Meilleur prix</div>
                  )}
                  <div style={{ fontWeight: 700, color: selectedPlan === p.id ? '#C9A84C' : '#ccc', marginBottom: '0.2rem' }}>{p.label}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fff' }}>{p.price}</div>
                  <div style={{ fontSize: '0.72rem', color: '#555', marginTop: '0.2rem' }}>{p.sub}</div>
                </div>
              ))}
            </div>

            <button
              onClick={startCheckout}
              disabled={checkingOut}
              style={{ width: '100%', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.9rem', borderRadius: 10, border: 'none', fontSize: '1rem', fontWeight: 800, cursor: checkingOut ? 'wait' : 'pointer', letterSpacing: '0.03em', opacity: checkingOut ? 0.7 : 1 }}
            >
              {checkingOut ? 'Redirection…' : `S'abonner — ${selectedPlan === 'annual' ? '$499/an' : '$49/mois'}`}
            </button>

            <div style={{ marginTop: '1rem', color: '#444', fontSize: '0.75rem' }}>
              Paiement sécurisé via Stripe · Résiliation à tout moment
            </div>
          </div>
        )}

        {/* ── Main content (only when subscribed) ── */}
        {subscribed && <>

        {/* Subscription success banner */}
        {subSuccess && (
          <div style={{ background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🎉</span>
            <div>
              <div style={{ color: '#2ecc71', fontWeight: 700 }}>Abonnement activé avec succès !</div>
              <div style={{ color: '#888', fontSize: '0.82rem', marginTop: '0.2rem' }}>Bienvenue sur le Trader Portal. Votre accès est maintenant actif.</div>
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom:'1.5rem' }}>
          <div style={{ fontSize:'1.6rem', fontWeight:'800', marginBottom:'0.25rem' }}>{t('trader.portal_title')}</div>
          <div style={{ color:'#666', fontSize:'0.875rem' }}>{t('trader.portal_subtitle')}</div>
        </div>

        {/* Stats banner */}
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'0.75rem', marginBottom:'1.75rem' }}>
            <div style={G.stat}>
              <div style={{ fontSize:'1.5rem', fontWeight:'800', color:'#C9A84C' }}>{stats.watched_total}</div>
              <div style={{ color:'#555', fontSize:'0.75rem' }}>Watched</div>
            </div>
            <div style={G.stat}>
              <div style={{ fontSize:'1.5rem', fontWeight:'800', color:'#2ecc71' }}>{stats.watched_certified}</div>
              <div style={{ color:'#555', fontSize:'0.75rem' }}>Certified</div>
            </div>
            <div style={G.stat}>
              <div style={{ fontSize:'1.5rem', fontWeight:'800', color: stats.expiring_soon > 0 ? '#f39c12' : '#eee' }}>{stats.expiring_soon}</div>
              <div style={{ color:'#555', fontSize:'0.75rem' }}>Expiring &lt;30d</div>
            </div>
            <div style={G.stat}>
              <div style={{ fontSize:'1.5rem', fontWeight:'800', color:'#888' }}>{stats.uncertified}</div>
              <div style={{ color:'#555', fontSize:'0.75rem' }}>Uncertified</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1.25rem' }}>
          <button style={G.tab(tab === 'registry')}  onClick={() => { setTab('registry');  setPage(1) }}>🌐 Registry</button>
          <button style={G.tab(tab === 'watchlist')} onClick={() => { setTab('watchlist'); setPage(1) }}>
            ★ Watchlist {stats?.watched_total > 0 ? `(${stats.watched_total})` : ''}
          </button>
          {tab === 'watchlist' && (
            <button
              onClick={handleExport}
              disabled={exporting || !stats?.watched_total}
              style={{ ...G.outline, marginLeft:'auto', opacity: (!stats?.watched_total || exporting) ? 0.5 : 1, fontSize:'0.78rem' }}
            >
              {exporting ? '…' : '↓ CSV'}
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap', marginBottom:'1.5rem', alignItems:'center' }}>
          <input type="text" placeholder={t('trader.search_placeholder')}
            style={{ ...G.inp, flex:'1', minWidth:'220px' }}
            value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
          {tab === 'registry' && (
            <>
              <select style={G.sel} value={level} onChange={e => setLevel(parseInt(e.target.value, 10))}>
                <option value={0}>{t('trader.all_levels')}</option>
                <option value={1}>L1+</option><option value={2}>L2+</option><option value={3}>L3</option>
              </select>
              {countries.length > 0 && (
                <select style={G.sel} value={country} onChange={e => setCountry(e.target.value)}>
                  <option value="">{t('trader.all_countries')}</option>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </>
          )}
          <div style={{ color:'#555', fontSize:'0.8rem', whiteSpace:'nowrap' }}>
            {!loading && `${total} ${t('trader.results_count')}`}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'1rem', marginBottom:'2rem' }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background:'#1a1a1a', border:'1px solid #222', borderRadius:'12px', padding:'1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                <Skeleton height="3px" radius="2px" />
                <Skeleton height="1rem" width="70%" />
                <Skeleton height="0.75rem" width="45%" />
                <Skeleton height="2rem" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background:'rgba(231,76,60,0.1)', border:'1px solid rgba(231,76,60,0.3)', color:'#ff7f7f', padding:'1rem', borderRadius:'8px', marginBottom:'1rem' }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && companies.length === 0 && (
          <div style={{ textAlign:'center', padding:'4rem 1rem' }}>
            <div style={{ fontSize:'3rem', marginBottom:'1rem', opacity:0.25 }}>{tab === 'watchlist' ? '★' : '🏭'}</div>
            <div style={{ color:'#ccc', fontWeight:'700', fontSize:'1.1rem', marginBottom:'0.5rem' }}>
              {tab === 'watchlist' ? 'Your watchlist is empty' : t('trader.empty_title')}
            </div>
            <div style={{ color:'#555', fontSize:'0.875rem', maxWidth:'340px', margin:'0 auto 1.5rem' }}>
              {tab === 'watchlist' ? 'Browse the registry and click ☆ to track companies.' : t('trader.empty_desc')}
            </div>
            {tab === 'watchlist' && (
              <button onClick={() => setTab('registry')} style={G.btn}>Browse Registry →</button>
            )}
          </div>
        )}

        {/* Grid */}
        {!loading && companies.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'1rem', marginBottom:'2rem' }}>
            {companies.map(renderCard)}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display:'flex', justifyContent:'center', gap:'0.5rem', flexWrap:'wrap' }}>
            {Array.from({ length: pages }, (_, i) => i + 1).map(pg => (
              <button key={pg}
                onClick={() => tab === 'registry' ? fetchRegistry(pg) : fetchWatchlist(pg)}
                style={{ padding:'0.5rem 0.9rem', borderRadius:'6px', border:'none', cursor:'pointer', fontWeight: pg === page ? '700' : '400', background: pg === page ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#1f1f1f', color: pg === page ? '#111' : '#888', fontSize:'0.85rem' }}
              >{pg}</button>
            ))}
          </div>
        )}
        </> /* end subscribed */}
      </main>
    </div>
  )
}
