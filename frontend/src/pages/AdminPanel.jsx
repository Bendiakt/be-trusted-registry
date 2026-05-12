import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function AdminPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [missions, setMissions] = useState([])
  const [pagination, setPagination] = useState({})
  // Audit log state
  const [auditLog, setAuditLog] = useState([])
  const [auditQ, setAuditQ] = useState('')
  const [auditPage, setAuditPage] = useState(1)
  const [q, setQ] = useState('')
  const [saving, setSaving]                 = useState({})
  const [levelInputs, setLevelInputs]       = useState({})
  const [missionStatus, setMissionStatus]   = useState({})
  const [statusSaving, setStatusSaving]     = useState({})
  const [expandedReport, setExpandedReport] = useState(null)
  const [suspendModal, setSuspendModal]     = useState(null)
  const [suspendReason, setSuspendReason]   = useState('')
  const [suspending, setSuspending]         = useState({})
  const [expandedDocs, setExpandedDocs]     = useState(null)   // companyId
  const [companyDocs, setCompanyDocs]       = useState({})     // { [companyId]: docs[] }
  const [docReviewing, setDocReviewing]     = useState({})

  useEffect(() => {
    const role = localStorage.getItem('role')
    if (!role || role !== 'admin') { navigate('/login'); return }
    fetchStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'users')     fetchUsers(1)
    if (tab === 'companies') fetchCompanies(1)
    if (tab === 'missions')  fetchMissions(1)
    if (tab === 'audit')     fetchAuditLog(1)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = async () => {
    try {
      const res = await api.get('/api/admin/stats')
      setStats(res.data)
    } catch { /* silent */ }
  }

  const fetchUsers = useCallback(async (page = 1) => {
    try {
      const res = await api.get(`/api/admin/users?page=${page}&limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      setUsers(res.data.data)
      setPagination(p => ({ ...p, users: res.data.pagination }))
    } catch { /* silent */ }
  }, [q])

  const fetchCompanies = useCallback(async (page = 1) => {
    try {
      const res = await api.get(`/api/admin/companies?page=${page}&limit=50${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      setCompanies(res.data.data)
      setPagination(p => ({ ...p, companies: res.data.pagination }))
    } catch { /* silent */ }
  }, [q])

  const fetchMissions = useCallback(async (page = 1) => {
    try {
      const res = await api.get(`/api/admin/missions?page=${page}&limit=50`)
      setMissions(res.data.data)
      setPagination(p => ({ ...p, missions: res.data.pagination }))
    } catch { /* silent */ }
  }, [])

  const fetchAuditLog = useCallback(async (page = 1, q = '') => {
    try {
      const qs = new URLSearchParams({ page, limit: 50 })
      if (q) qs.set('q', q)
      const res = await api.get(`/api/admin/audit-log?${qs}`)
      setAuditLog(res.data.data || [])
      setPagination(p => ({ ...p, audit: res.data.pagination }))
      setAuditPage(page)
    } catch { /* silent */ }
  }, [])

  const setCompanyLevel = async (companyId, level) => {
    setSaving(s => ({ ...s, [companyId]: true }))
    try {
      await api.patch(`/api/admin/companies/${companyId}/level`, { level: parseInt(level, 10) })
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, certification_level: parseInt(level, 10) } : c))
      fetchStats()
    } catch { /* silent */ }
    finally { setSaving(s => ({ ...s, [companyId]: false })) }
  }

  const updateMissionStatus = async (missionId, status) => {
    setStatusSaving(s => ({ ...s, [missionId]: true }))
    try {
      await api.patch(`/api/admin/missions/${missionId}/status`, { status })
      setMissions(prev => prev.map(m => m.id === missionId ? { ...m, status } : m))
    } catch { /* silent */ }
    finally { setStatusSaving(s => ({ ...s, [missionId]: false })) }
  }

  const toggleSuspend = async (companyId, isSuspended, reason = '') => {
    setSuspending(s => ({ ...s, [companyId]: true }))
    try {
      await api.patch(`/api/admin/companies/${companyId}/suspend`, { suspend: !isSuspended, reason })
      setCompanies(prev => prev.map(c => c.id === companyId
        ? { ...c, suspended_at: !isSuspended ? new Date().toISOString() : null, suspended_reason: reason }
        : c
      ))
      setSuspendModal(null)
      setSuspendReason('')
    } catch { /* silent */ }
    finally { setSuspending(s => ({ ...s, [companyId]: false })) }
  }

  const loadCompanyDocs = async (companyId) => {
    if (companyDocs[companyId]) { setExpandedDocs(expandedDocs === companyId ? null : companyId); return }
    try {
      const res = await api.get(`/api/documents/admin/${companyId}`)
      setCompanyDocs(d => ({ ...d, [companyId]: res.data.documents || [] }))
      setExpandedDocs(companyId)
    } catch { /* silent */ }
  }

  const reviewDoc = async (docId, companyId, status) => {
    setDocReviewing(r => ({ ...r, [docId]: true }))
    try {
      await api.patch(`/api/documents/admin/${docId}/review`, { status })
      setCompanyDocs(d => ({
        ...d,
        [companyId]: (d[companyId] || []).map(doc => doc.id === docId ? { ...doc, status } : doc),
      }))
    } catch { /* silent */ }
    finally { setDocReviewing(r => ({ ...r, [docId]: false })) }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (tab === 'users')     fetchUsers(1)
    if (tab === 'companies') fetchCompanies(1)
  }

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken')
    try { await api.post('/api/auth/logout', { refreshToken }) } catch { /* best-effort */ }
    localStorage.clear()
    navigate('/login')
  }

  const LEVEL_COLORS  = { 0: '#555', 1: '#CD7F32', 2: '#C0C0C0', 3: '#C9A84C' }
  const STATUS_COLORS = {
    available:  { bg: 'rgba(201,168,76,0.12)',  text: '#C9A84C' },
    assigned:   { bg: 'rgba(74,144,226,0.12)',  text: '#4a90e2' },
    completed:  { bg: 'rgba(46,204,113,0.12)',  text: '#2ecc71' },
    cancelled:  { bg: 'rgba(160,160,160,0.10)', text: '#666' },
  }
  const OUTCOME_COLORS = {
    pass:        { bg: 'rgba(46,204,113,0.10)',  text: '#2ecc71' },
    fail:        { bg: 'rgba(231,76,60,0.10)',   text: '#ff6b6b' },
    conditional: { bg: 'rgba(243,156,18,0.10)',  text: '#f39c12' },
  }

  const G = {
    page:    { minHeight: '100vh', background: '#111', fontFamily: 'sans-serif', color: '#eee' },
    nav:     { background: '#1a1a1a', borderBottom: '1px solid #333', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' },
    logo:    { color: '#C9A84C', fontWeight: '900', fontSize: '1.2rem', letterSpacing: '0.1em' },
    main:    { maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem' },
    card:    { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' },
    btn:     { background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.55rem 1.1rem', borderRadius: '6px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.8rem' },
    outline: { background: 'transparent', color: '#C9A84C', padding: '0.55rem 1.1rem', borderRadius: '6px', border: '1px solid #C9A84C', fontWeight: '600', cursor: 'pointer', fontSize: '0.8rem' },
    inp:     { padding: '0.55rem 0.9rem', background: '#1f1f1f', border: '1px solid #2e2e2e', borderRadius: '6px', color: '#fff', fontSize: '0.875rem', outline: 'none' },
    th:      { color: '#555', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.5rem 0.75rem', textAlign: 'left', borderBottom: '1px solid #222' },
    td:      { padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: '#ccc', borderBottom: '1px solid #1a1a1a', verticalAlign: 'middle' },
  }

  const TABS = [
    { id: 'overview',  label: t('admin.tabs.overview') },
    { id: 'users',     label: t('admin.tabs.users') },
    { id: 'companies', label: t('admin.tabs.companies') },
    { id: 'missions',  label: t('admin.tabs.missions') },
    { id: 'audit',     label: t('admin.tabs.audit') },
  ]

  return (
    <div style={G.page}>
      <nav style={G.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={G.logo}>{t('admin.title')}</div>
          <div style={{ width: '1px', height: '24px', background: '#333' }} />
          <div style={{ color: '#555', fontSize: '0.75rem', letterSpacing: '0.08em' }}>B&amp;E Registry</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <LanguageSwitcher />
          <button onClick={handleLogout} style={{ ...G.outline, padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>{t('nav.logout')}</button>
        </div>
      </nav>

      <main style={G.main}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '2rem', borderBottom: '1px solid #222' }}>
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '0.75rem 1.5rem', background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === id ? '#C9A84C' : '#555',
              borderBottom: tab === id ? '2px solid #C9A84C' : '2px solid transparent',
              fontWeight: tab === id ? '700' : '400',
              fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>{label}</button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { label: t('admin.stats.total_users'),    value: stats.users?.total,     color: '#C9A84C' },
              { label: t('admin.stats.new_30d'),        value: stats.users?.last_30d,  color: '#4a90e2' },
              { label: t('admin.stats.total_companies'),value: stats.companies?.total, color: '#888' },
              { label: t('admin.stats.certified'),      value: stats.companies?.certified, color: '#4CAF50' },
              { label: t('admin.stats.revenue'),        value: `$${stats.revenue?.total_usd}`, color: '#C9A84C', raw: true },
            ].map(item => (
              <div key={item.label} style={{ ...G.card, marginBottom: 0, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg,${item.color},transparent)` }} />
                <div style={{ color: '#555', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{item.label}</div>
                <div style={{ color: item.color, fontSize: '2rem', fontWeight: '900' }}>{item.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <div style={G.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontWeight: '700', fontSize: '1rem' }}>{t('admin.users.title')}</div>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
                <input style={G.inp} placeholder={t('admin.search_placeholder')} value={q} onChange={e => setQ(e.target.value)} />
                <button type="submit" style={G.btn}>⌕</button>
              </form>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={G.th}>ID</th>
                    <th style={G.th}>{t('admin.users.name')}</th>
                    <th style={G.th}>{t('admin.users.email')}</th>
                    <th style={G.th}>{t('admin.users.role')}</th>
                    <th style={G.th}>{t('admin.users.joined')}</th>
                    <th style={G.th}>{t('admin.users.last_login')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={6} style={{ ...G.td, textAlign: 'center', color: '#444' }}>{t('admin.no_data')}</td></tr>
                  )}
                  {users.map(u => (
                    <tr key={u.id} style={{ background: 'transparent' }}>
                      <td style={{ ...G.td, color: '#555' }}>{u.id}</td>
                      <td style={G.td}>{u.name}</td>
                      <td style={{ ...G.td, color: '#888' }}>{u.email}</td>
                      <td style={G.td}>
                        <span style={{ background: '#1f1f1f', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: '700', color: u.role === 'admin' ? '#ff6b6b' : u.role === 'pac' ? '#C9A84C' : '#888', letterSpacing: '0.05em' }}>
                          {u.role?.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...G.td, color: '#555' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                      <td style={{ ...G.td, color: '#555' }}>{u.last_login ? new Date(u.last_login).toLocaleString() : t('admin.users.never')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar pag={pagination.users} onPage={p => fetchUsers(p)} G={G} />
          </div>
        )}

        {/* Companies */}
        {tab === 'companies' && (
          <div style={G.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontWeight: '700', fontSize: '1rem' }}>{t('admin.companies.title')}</div>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem' }}>
                <input style={G.inp} placeholder={t('admin.search_placeholder')} value={q} onChange={e => setQ(e.target.value)} />
                <button type="submit" style={G.btn}>⌕</button>
              </form>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={G.th}>ID</th>
                    <th style={G.th}>{t('admin.companies.name')}</th>
                    <th style={G.th}>{t('admin.companies.email')}</th>
                    <th style={G.th}>{t('admin.companies.country')}</th>
                    <th style={G.th}>{t('admin.companies.sector')}</th>
                    <th style={G.th}>{t('admin.companies.level')}</th>
                    <th style={G.th}>{t('admin.companies.set_level')}</th>
                    <th style={G.th}>Docs</th>
                    <th style={G.th}>{t('admin.companies.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 && (
                    <tr><td colSpan={9} style={{ ...G.td, textAlign: 'center', color: '#444' }}>{t('admin.no_data')}</td></tr>
                  )}
                  {companies.map(c => {
                    const lvlColor = LEVEL_COLORS[c.certification_level] || '#555'
                    const inputVal = levelInputs[c.id] !== undefined ? levelInputs[c.id] : c.certification_level
                    return (
                      <React.Fragment key={c.id}>
                      <tr>
                        <td style={{ ...G.td, color: '#555' }}>{c.id}</td>
                        <td style={{ ...G.td, fontWeight: '600' }}>{c.company_name || c.name}</td>
                        <td style={{ ...G.td, color: '#666' }}>{c.email}</td>
                        <td style={G.td}>{c.country || '—'}</td>
                        <td style={{ ...G.td, color: '#666' }}>{c.sector || c.industry || '—'}</td>
                        <td style={G.td}>
                          <span style={{ color: lvlColor, fontWeight: '700' }}>L{c.certification_level}</span>
                        </td>
                        <td style={{ ...G.td }}>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <select
                              value={inputVal}
                              onChange={e => setLevelInputs(li => ({ ...li, [c.id]: e.target.value }))}
                              style={{ ...G.inp, padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                            >
                              {[0,1,2,3].map(l => <option key={l} value={l}>L{l}</option>)}
                            </select>
                            <button
                              onClick={() => setCompanyLevel(c.id, inputVal !== undefined ? inputVal : c.certification_level)}
                              disabled={saving[c.id]}
                              style={{ ...G.btn, padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                            >
                              {saving[c.id] ? t('admin.saving') : t('admin.save')}
                            </button>
                          </div>
                        </td>
                        <td style={{ ...G.td }}>
                          <button
                            onClick={() => loadCompanyDocs(c.id)}
                            style={{ background: 'transparent', color: '#4a90e2', border: '1px solid rgba(74,144,226,0.25)', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            Docs {expandedDocs === c.id ? '▲' : '▼'}
                          </button>
                        </td>
                        <td style={{ ...G.td }}>
                          {c.suspended_at ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <span style={{ background: 'rgba(231,76,60,0.12)', color: '#ff6b6b', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.06em' }}>SUSPENDED</span>
                              <button
                                onClick={() => toggleSuspend(c.id, true)}
                                disabled={suspending[c.id]}
                                style={{ ...G.outline, padding: '0.2rem 0.5rem', fontSize: '0.65rem', color: '#2ecc71', border: '1px solid #2ecc7144' }}
                              >
                                {suspending[c.id] ? '…' : t('admin.companies.unsuspend')}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setSuspendModal({ companyId: c.id, companyName: c.company_name || c.name }); setSuspendReason('') }}
                              style={{ ...G.outline, padding: '0.2rem 0.5rem', fontSize: '0.65rem', color: '#ff6b6b', border: '1px solid rgba(231,76,60,0.3)' }}
                            >
                              {t('admin.companies.suspend')}
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Expanded docs panel */}
                      {expandedDocs === c.id && (
                        <tr key={`docs-${c.id}`}>
                          <td colSpan={9} style={{ background: 'rgba(74,144,226,0.04)', padding: '0.75rem 1rem', borderBottom: '1px solid #1a1a1a' }}>
                            <div style={{ fontWeight: '700', fontSize: '0.75rem', color: '#4a90e2', marginBottom: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Documents — {c.company_name || c.name}</div>
                            {!(companyDocs[c.id]?.length) ? (
                              <div style={{ color: '#444', fontSize: '0.8rem' }}>No documents uploaded.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {(companyDocs[c.id] || []).map(doc => (
                                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', background: '#111', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                                    <div style={{ flex: 1, minWidth: '140px' }}>
                                      <div style={{ color: '#ccc', fontSize: '0.8rem' }}>{doc.original_name}</div>
                                      <div style={{ color: '#555', fontSize: '0.7rem' }}>{doc.doc_type} · {(doc.size_bytes / 1024).toFixed(0)} KB</div>
                                      {doc.review_note && <div style={{ color: '#666', fontSize: '0.7rem', marginTop: '0.1rem' }}>{doc.review_note}</div>}
                                    </div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase',
                                      background: doc.status === 'approved' ? 'rgba(46,204,113,0.1)' : doc.status === 'rejected' ? 'rgba(231,76,60,0.1)' : 'rgba(243,156,18,0.1)',
                                      color: doc.status === 'approved' ? '#2ecc71' : doc.status === 'rejected' ? '#ff6b6b' : '#f39c12' }}>
                                      {doc.status}
                                    </span>
                                    <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" style={{ color: '#555', fontSize: '0.75rem', border: '1px solid #2a2a2a', padding: '0.2rem 0.5rem', borderRadius: '4px', textDecoration: 'none' }}>↗</a>
                                    {doc.status !== 'approved' && (
                                      <button disabled={docReviewing[doc.id]} onClick={() => reviewDoc(doc.id, c.id, 'approved')} style={{ ...G.btn, padding: '0.2rem 0.6rem', fontSize: '0.65rem' }}>
                                        {docReviewing[doc.id] ? '…' : '✓ Approve'}
                                      </button>
                                    )}
                                    {doc.status !== 'rejected' && (
                                      <button disabled={docReviewing[doc.id]} onClick={() => reviewDoc(doc.id, c.id, 'rejected')} style={{ ...G.outline, padding: '0.2rem 0.6rem', fontSize: '0.65rem', color: '#ff6b6b', border: '1px solid rgba(231,76,60,0.3)' }}>
                                        ✕ Reject
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar pag={pagination.companies} onPage={p => fetchCompanies(p)} G={G} />
          </div>
        )}

        {/* Missions */}
        {tab === 'missions' && (
          <div style={G.card}>
            <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '1.25rem' }}>{t('admin.missions.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {missions.length === 0 && (
                <div style={{ ...G.td, textAlign: 'center', color: '#444', padding: '2rem' }}>{t('admin.no_data')}</div>
              )}
              {missions.map(m => {
                const sc   = STATUS_COLORS[m.status] || STATUS_COLORS.available
                const oc   = m.outcome ? (OUTCOME_COLORS[m.outcome] || OUTCOME_COLORS.pass) : null
                const sel  = missionStatus[m.id] !== undefined ? missionStatus[m.id] : m.status
                const isExpanded = expandedReport === m.id

                return (
                  <div key={m.id} style={{ background: '#141414', border: '1px solid #222', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Main row */}
                    <div style={{ padding: '0.9rem 1.1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span style={{ color: '#444', fontSize: '0.7rem' }}>#{m.id}</span>
                          <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#eee' }}>{m.company_name || '—'}</span>
                        </div>
                        <div style={{ color: '#555', fontSize: '0.75rem' }}>{m.location || '—'}{m.type ? ` · ${m.type}` : ''}</div>
                        {m.pac_name && <div style={{ color: '#555', fontSize: '0.7rem', marginTop: '0.2rem' }}>PAC: {m.pac_name}</div>}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Status badge */}
                        <span style={{ borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', background: sc.bg, color: sc.text }}>
                          {m.status}
                        </span>

                        {/* Outcome badge */}
                        {oc && (
                          <span style={{ borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase', background: oc.bg, color: oc.text }}>
                            {m.outcome}
                          </span>
                        )}

                        {/* Fee */}
                        <span style={{ color: '#C9A84C', fontSize: '0.8rem', fontWeight: '700' }}>${m.fee_usd || 500}</span>

                        {/* View report link (completed missions) */}
                        {m.status === 'completed' && (
                          <Link to={`/pac/missions/${m.id}/report`} target="_blank" style={{ color: '#4a90e2', fontSize: '0.7rem', border: '1px solid rgba(74,144,226,0.25)', padding: '0.2rem 0.5rem', borderRadius: '4px', textDecoration: 'none' }}>
                            Report ↗
                          </Link>
                        )}

                        {/* Verify link */}
                        {m.company_id && (
                          <Link to={`/verify/${m.company_id}`} target="_blank" style={{ color: '#555', fontSize: '0.7rem', border: '1px solid #2a2a2a', padding: '0.2rem 0.5rem', borderRadius: '4px', textDecoration: 'none' }}>
                            🔗
                          </Link>
                        )}

                        {/* Report expand button */}
                        {m.report_text && (
                          <button onClick={() => setExpandedReport(isExpanded ? null : m.id)} style={{ background: 'transparent', color: '#555', border: '1px solid #2a2a2a', padding: '0.2rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                            {isExpanded ? '▲ ' : '▼ '}{t('admin.missions.report')}
                          </button>
                        )}

                        {/* Status change */}
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          <select
                            value={sel}
                            onChange={e => setMissionStatus(ms => ({ ...ms, [m.id]: e.target.value }))}
                            style={{ ...G.inp, padding: '0.25rem 0.5rem', fontSize: '0.7rem' }}
                          >
                            {['available','assigned','completed','cancelled'].map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => updateMissionStatus(m.id, sel)}
                            disabled={statusSaving[m.id] || sel === m.status}
                            style={{ ...G.btn, padding: '0.25rem 0.6rem', fontSize: '0.7rem', opacity: sel === m.status ? 0.4 : 1 }}
                          >
                            {statusSaving[m.id] ? '…' : t('admin.save')}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Report text (expandable) */}
                    {isExpanded && m.report_text && (
                      <div style={{ borderTop: '1px solid #1c1c1c', padding: '0.9rem 1.1rem', background: 'rgba(46,204,113,0.02)' }}>
                        <div style={{ color: '#444', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{t('admin.missions.report')}</div>
                        <div style={{ color: '#777', fontSize: '0.8rem', lineHeight: 1.6 }}>{m.report_text}</div>
                        {m.completed_at && (
                          <div style={{ color: '#333', fontSize: '0.7rem', marginTop: '0.5rem' }}>
                            {new Date(m.completed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <PaginationBar pag={pagination.missions} onPage={p => fetchMissions(p)} G={G} />
          </div>
        )}

        {/* ── Audit Log Tab ─────────────────────────────────────────────── */}
        {tab === 'audit' && (
          <div style={G.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: '700', fontSize: '1rem' }}>{t('admin.tabs.audit')}</div>
              <form onSubmit={e => { e.preventDefault(); fetchAuditLog(1, auditQ) }} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={auditQ}
                  onChange={e => setAuditQ(e.target.value)}
                  placeholder="Search action / email…"
                  style={{ ...G.inp, minWidth: '220px' }}
                />
                <button type="submit" style={G.btn}>Search</button>
                {auditQ && <button type="button" onClick={() => { setAuditQ(''); fetchAuditLog(1, '') }} style={G.outline}>Clear</button>}
              </form>
            </div>

            {auditLog.length === 0 ? (
              <div style={{ color: '#444', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>No audit entries found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['ID', 'Action', 'Resource', 'User', 'IP Address', 'Timestamp'].map(h => (
                        <th key={h} style={G.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map(entry => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid #1c1c1c' }}>
                        <td style={{ ...G.td, color: '#444', fontSize: '0.7rem' }}>#{entry.id}</td>
                        <td style={G.td}>
                          <span style={{
                            padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '600', fontFamily: 'monospace',
                            background: entry.action.includes('delete') || entry.action.includes('suspend') ? 'rgba(231,76,60,0.12)' :
                                        entry.action.includes('login') || entry.action.includes('register') ? 'rgba(74,144,226,0.12)' :
                                        'rgba(201,168,76,0.10)',
                            color: entry.action.includes('delete') || entry.action.includes('suspend') ? '#ff6b6b' :
                                   entry.action.includes('login') || entry.action.includes('register') ? '#4a90e2' :
                                   '#C9A84C',
                          }}>{entry.action}</span>
                        </td>
                        <td style={{ ...G.td, color: '#888', fontFamily: 'monospace', fontSize: '0.75rem' }}>{entry.resource || '—'}</td>
                        <td style={G.td}>
                          {entry.user_email ? (
                            <div>
                              <div style={{ color: '#ccc', fontSize: '0.8rem' }}>{entry.user_name || entry.user_email}</div>
                              <div style={{ color: '#555', fontSize: '0.7rem' }}>{entry.user_email}</div>
                            </div>
                          ) : <span style={{ color: '#444' }}>anonymous</span>}
                        </td>
                        <td style={{ ...G.td, fontFamily: 'monospace', fontSize: '0.72rem', color: '#555' }}>{entry.ip_address || '—'}</td>
                        <td style={{ ...G.td, color: '#555', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar pag={pagination.audit} onPage={p => fetchAuditLog(p, auditQ)} G={G} />
          </div>
        )}
      </main>

      {/* ── Suspend confirmation modal ──────────────────────────────────── */}
      {suspendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '2rem', maxWidth: '420px', width: '100%' }}>
            <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '0.5rem', color: '#ff6b6b' }}>{t('admin.companies.suspend_title')}</div>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {t('admin.companies.suspend_confirm')} <strong style={{ color: '#eee' }}>{suspendModal.companyName}</strong>
            </div>
            <textarea
              placeholder={t('admin.companies.suspend_reason_placeholder')}
              value={suspendReason}
              onChange={e => setSuspendReason(e.target.value)}
              rows={3}
              style={{ ...G.inp, width: '100%', resize: 'vertical', marginBottom: '1.25rem', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setSuspendModal(null)} style={{ ...G.outline, padding: '0.5rem 1rem' }}>{t('admin.cancel')}</button>
              <button
                onClick={() => toggleSuspend(suspendModal.companyId, false, suspendReason)}
                disabled={suspending[suspendModal.companyId]}
                style={{ ...G.btn, padding: '0.5rem 1rem', background: 'linear-gradient(135deg,#e74c3c,#c0392b)', color: '#fff' }}
              >
                {suspending[suspendModal.companyId] ? '…' : t('admin.companies.confirm_suspend')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PaginationBar({ pag, onPage, G }) {
  if (!pag || pag.pages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginTop: '1rem', flexWrap: 'wrap' }}>
      {Array.from({ length: pag.pages }, (_, i) => i + 1).map(pg => (
        <button key={pg} onClick={() => onPage(pg)} style={{
          padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem',
          background: pg === pag.page ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#1f1f1f',
          color: pg === pag.page ? '#111' : '#888', fontWeight: pg === pag.page ? '700' : '400',
        }}>{pg}</button>
      ))}
    </div>
  )
}
