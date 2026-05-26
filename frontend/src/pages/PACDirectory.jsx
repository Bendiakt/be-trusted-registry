'use strict'
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Skeleton from '../components/Skeleton'

const TIER_META = {
  S1: { label: 'S1 Associate',  color: '#4a90e2', bg: 'rgba(74,144,226,0.1)',  desc: 'Junior PAC Auditor' },
  S2: { label: 'S2 Certified',  color: '#C9A84C', bg: 'rgba(201,168,76,0.1)', desc: 'Certified PAC Auditor' },
  S3: { label: 'S3 Senior',     color: '#e056fd', bg: 'rgba(224,86,253,0.1)', desc: 'Senior PAC Expert' },
}

const StarBar = ({ value, max = 5, color }) => {
  if (value == null) return <span style={{ color: '#333', fontSize: '0.7rem' }}>—</span>
  const filled = Math.round(value)
  return (
    <span style={{ display: 'inline-flex', gap: '1px', alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} style={{ color: i < filled ? color : '#2a2a2a', fontSize: '0.75rem' }}>★</span>
      ))}
      <span style={{ color, fontSize: '0.7rem', fontWeight: '700', marginLeft: '0.3rem' }}>{value.toFixed(1)}</span>
    </span>
  )
}

export default function PACDirectory() {
  const [agents, setAgents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [q, setQ]             = useState('')
  const [tier, setTier]       = useState('')
  const [page, setPage]       = useState(1)
  const [pagination, setPagination] = useState({ total: 0, pages: 1 })

  // SEO meta tags
  useEffect(() => {
    const BASE = 'https://mydd.work'
    document.title = 'PAC Auditors — B&E Certified Due Diligence Experts | MyDD'
    ;[
      ['meta[name="description"]',        { name: 'description',        content: 'Browse B&E-certified PAC auditors for supply chain due diligence, ESG inspections, and supplier compliance. Verified experts across 3 certification tiers.' }],
      ['meta[property="og:type"]',        { property: 'og:type',        content: 'website' }],
      ['meta[property="og:url"]',         { property: 'og:url',         content: `${BASE}/agents` }],
      ['meta[property="og:title"]',       { property: 'og:title',       content: 'PAC Auditors — B&E Certified Experts' }],
      ['meta[property="og:description"]', { property: 'og:description', content: 'Find certified supply chain auditors and due diligence experts on the B&E PAC Network.' }],
    ].forEach(([sel, attrs]) => {
      let el = document.querySelector(sel)
      if (!el) { el = document.createElement('meta'); document.head.appendChild(el) }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    })
  }, [])

  const fetchAgents = useCallback(async (p = 1, currentQ = q, currentTier = tier) => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ page: p, limit: 20 })
      if (currentQ)    qs.set('q',    currentQ)
      if (currentTier) qs.set('tier', currentTier)
      const res = await api.get(`/api/pac/directory?${qs}`)
      setAgents(res.data.agents)
      setPagination(res.data.pagination)
      setPage(p)
    } catch {
      setError('Impossible de charger le répertoire.')
    } finally {
      setLoading(false)
    }
  }, [q, tier])

  useEffect(() => { fetchAgents(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e) => {
    e.preventDefault()
    fetchAgents(1, q, tier)
  }

  const handleTier = (t) => {
    const next = tier === t ? '' : t
    setTier(next)
    fetchAgents(1, q, next)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', color: '#eee', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Nav ── */}
      <nav style={{ borderBottom: '1px solid #1a1a1a', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'rgba(13,13,13,0.97)', backdropFilter: 'blur(8px)', zIndex: 50 }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: '900', fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#eee' }}>B&E</span>
          <span style={{ color: '#C9A84C', fontWeight: '700', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>PAC Network</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/registry" style={{ color: '#555', fontSize: '0.82rem', textDecoration: 'none' }}>Certifications</Link>
          <LanguageSwitcher />
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3.5rem 1.5rem 2rem' }}>
        <div style={{ marginBottom: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)', borderRadius: '20px', padding: '0.25rem 0.75rem' }}>
          <span style={{ color: '#C9A84C', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Réseau PAC Certifié</span>
        </div>
        <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: '900', lineHeight: 1.15, marginBottom: '1rem', letterSpacing: '-0.03em' }}>
          Auditeurs B&E<br />
          <span style={{ color: '#C9A84C' }}>certifiés & vérifiés</span>
        </h1>
        <p style={{ color: '#666', fontSize: '1rem', lineHeight: 1.7, maxWidth: '580px', marginBottom: '2rem' }}>
          Chaque expert PAC est sélectionné, formé et certifié par B&E Consulting.
          Audit terrain, due diligence fournisseur, conformité ESG — trois niveaux de certification pour tous vos besoins.
        </p>

        {/* Stats bar */}
        {pagination.total > 0 && (
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#C9A84C', fontSize: '1.6rem', fontWeight: '900' }}>{pagination.total}</div>
              <div style={{ color: '#444', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Experts actifs</div>
            </div>
            <div style={{ width: '1px', background: '#1a1a1a' }} />
            <div>
              <div style={{ color: '#eee', fontSize: '1.6rem', fontWeight: '900' }}>3</div>
              <div style={{ color: '#444', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Niveaux de certification</div>
            </div>
            <div style={{ width: '1px', background: '#1a1a1a' }} />
            <div>
              <div style={{ color: '#4CAF50', fontSize: '1.6rem', fontWeight: '900' }}>✔</div>
              <div style={{ color: '#444', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>KYC vérifié</div>
            </div>
          </div>
        )}

        {/* ── Search + Filter ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Rechercher par nom, localisation, expertise…"
              style={{ flex: 1, background: '#111', border: '1px solid #222', color: '#eee', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.9rem', outline: 'none' }}
            />
            <button type="submit" style={{ background: '#C9A84C', color: '#000', border: 'none', borderRadius: '8px', padding: '0.75rem 1.25rem', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Rechercher
            </button>
          </form>

          {/* Tier chips */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#444', fontSize: '0.75rem', alignSelf: 'center', marginRight: '0.25rem' }}>Niveau :</span>
            {['S1', 'S2', 'S3'].map(t => {
              const tm = TIER_META[t]
              const active = tier === t
              return (
                <button
                  key={t}
                  onClick={() => handleTier(t)}
                  style={{ background: active ? tm.bg : '#111', border: `1px solid ${active ? tm.color : '#222'}`, color: active ? tm.color : '#555', borderRadius: '20px', padding: '0.3rem 0.85rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  {tm.label}
                </button>
              )
            })}
            {(tier || q) && (
              <button
                onClick={() => { setQ(''); setTier(''); fetchAgents(1, '', '') }}
                style={{ background: 'transparent', border: '1px solid #1e1e1e', color: '#333', borderRadius: '20px', padding: '0.3rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                ✕ Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '10px', padding: '1rem 1.25rem', color: '#ff6b6b', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {/* ── Agents grid ── */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} style={{ height: '140px', borderRadius: '14px' }} />)}
          </div>
        ) : agents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#333' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔍</div>
            <div style={{ fontSize: '0.9rem' }}>Aucun expert trouvé pour cette recherche.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && pagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => fetchAgents(page - 1)}
              disabled={page <= 1}
              style={{ background: '#111', border: '1px solid #222', color: page <= 1 ? '#333' : '#888', borderRadius: '8px', padding: '0.5rem 1rem', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.82rem' }}
            >
              ← Précédent
            </button>
            <span style={{ padding: '0.5rem 0.75rem', color: '#555', fontSize: '0.82rem', alignSelf: 'center' }}>
              {page} / {pagination.pages}
            </span>
            <button
              onClick={() => fetchAgents(page + 1)}
              disabled={page >= pagination.pages}
              style={{ background: '#111', border: '1px solid #222', color: page >= pagination.pages ? '#333' : '#888', borderRadius: '8px', padding: '0.5rem 1rem', cursor: page >= pagination.pages ? 'not-allowed' : 'pointer', fontSize: '0.82rem' }}
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: '1px solid #111', padding: '2rem', textAlign: 'center', marginTop: '3rem' }}>
        <div style={{ color: '#333', fontSize: '0.78rem' }}>
          © {new Date().getFullYear()} B&E Consulting · <Link to="/legal" style={{ color: '#333', textDecoration: 'none' }}>Mentions légales</Link> · <Link to="/registry" style={{ color: '#333', textDecoration: 'none' }}>Certifications entreprises</Link>
        </div>
      </div>
    </div>
  )
}

// ── AgentCard ─────────────────────────────────────────────────────────────────
function AgentCard({ agent }) {
  const tm = TIER_META[agent.tier] || TIER_META.S1
  const onTimePct = agent.missionsCompleted > 0
    ? Math.round((agent.missionsOnTime / agent.missionsCompleted) * 100)
    : null

  return (
    <Link to={`/agents/${agent.id}`} style={{ textDecoration: 'none', display: 'block' }}>
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s, background 0.15s', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = tm.color + '44'; e.currentTarget.style.background = '#141414' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.background = '#111' }}
    >
      {/* Tier accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,${tm.color},transparent)` }} />

      {/* Avatar */}
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: tm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0, border: `1px solid ${tm.color}33` }}>
        👤
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          <span style={{ fontWeight: '800', fontSize: '1rem', color: '#eee' }}>{agent.name || 'Expert PAC'}</span>
          <span style={{ background: tm.bg, color: tm.color, fontSize: '0.65rem', fontWeight: '800', padding: '0.15rem 0.5rem', borderRadius: '4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {tm.label}
          </span>
          <span style={{ background: 'rgba(46,204,113,0.08)', color: '#2ecc71', fontSize: '0.62rem', fontWeight: '700', padding: '0.12rem 0.45rem', borderRadius: '4px', letterSpacing: '0.06em' }}>
            ✔ Vérifié
          </span>
        </div>

        {agent.location && (
          <div style={{ color: '#555', fontSize: '0.78rem', marginBottom: '0.5rem' }}>📍 {agent.location}</div>
        )}

        {agent.bio && (
          <div style={{ color: '#888', fontSize: '0.82rem', lineHeight: 1.55, marginBottom: '0.6rem' }}>
            {agent.bio.length > 160 ? agent.bio.slice(0, 160) + '…' : agent.bio}
          </div>
        )}

        {/* Tags: expertise, languages */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {agent.expertise && agent.expertise.split(',').slice(0, 3).map(e => (
            <span key={e.trim()} style={{ background: '#1a1a1a', border: '1px solid #252525', color: '#666', fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              {e.trim()}
            </span>
          ))}
          {agent.languages && agent.languages.split(',').slice(0, 2).map(l => (
            <span key={l.trim()} style={{ background: '#1a1a1a', border: '1px solid #252525', color: '#555', fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              🌐 {l.trim()}
            </span>
          ))}
        </div>
      </div>

      {/* Right: stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-end', minWidth: '130px' }}>
        {/* Missions count */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: tm.color, fontSize: '1.5rem', fontWeight: '900', lineHeight: 1 }}>{agent.missionsCompleted}</div>
          <div style={{ color: '#333', fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Missions</div>
        </div>

        {/* On-time rate */}
        {onTimePct !== null && agent.missionsCompleted >= 3 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: onTimePct >= 80 ? '#2ecc71' : onTimePct >= 60 ? '#f39c12' : '#ff6b6b', fontSize: '0.85rem', fontWeight: '800' }}>{onTimePct}%</div>
            <div style={{ color: '#333', fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>On-time</div>
          </div>
        )}

        {/* Scores */}
        {agent.avgClientScore != null && (
          <div style={{ textAlign: 'right' }}>
            <StarBar value={agent.avgClientScore} color="#C9A84C" />
            <div style={{ color: '#333', fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.15rem' }}>Client</div>
          </div>
        )}
        {agent.avgAdminScore != null && (
          <div style={{ textAlign: 'right' }}>
            <StarBar value={agent.avgAdminScore} color="#e056fd" />
            <div style={{ color: '#333', fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.15rem' }}>B&E</div>
          </div>
        )}

        {/* Promotion date */}
        {(agent.promotedS3 || agent.promotedS2) && (
          <div style={{ color: '#2a2a2a', fontSize: '0.65rem' }}>
            Certifié {new Date(agent.promotedS3 || agent.promotedS2).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
          </div>
        )}
        <div style={{ color: tm.color, fontSize: '0.68rem', fontWeight: '600', marginTop: '0.5rem', opacity: 0.7 }}>Voir le profil →</div>
      </div>
    </div>
    </Link>
  )
}
