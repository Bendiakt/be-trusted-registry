import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { getSession, clearSession } from '../lib/session'
import MetricsDashboard from '../components/MetricsDashboard'
import LanguageSwitcher from '../components/LanguageSwitcher'
import Skeleton from '../components/Skeleton'
import { useToast, ToastContainer } from '../components/Toast'
import { useMobile } from '../lib/useMobile'

const LEVEL_CONFIG = {
  0: { color: '#666',    bg: 'rgba(102,102,102,0.1)' },
  1: { color: '#CD7F32', bg: 'rgba(205,127,50,0.1)' },
  2: { color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)' },
  3: { color: '#C9A84C', bg: 'rgba(201,168,76,0.15)' },
}

// ── Onboarding stepper ────────────────────────────────────────────────────────
function OnboardingProgress({ company, certLevel, t, onRegister, onPricing }) {
  const steps = [
    { key: 'step_account',  done: true },
    { key: 'step_profile',  done: Boolean(company), action: onRegister },
    { key: 'step_certified',done: certLevel > 0,    action: onPricing  },
  ]
  const doneCount = steps.filter(s => s.done).length
  const pct = Math.round((doneCount / steps.length) * 100)

  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px',
      padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ color: '#aaa', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {t('dashboard.onboarding.title')}
        </div>
        <div style={{ color: '#555', fontSize: '0.75rem' }}>{pct}%</div>
      </div>

      {/* progress bar */}
      <div style={{ height: '4px', background: '#2a2a2a', borderRadius: '4px', marginBottom: '1.25rem', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg,#C9A84C,#9A7B2E)',
          borderRadius: '4px', transition: 'width 0.4s ease',
        }} />
      </div>

      {/* steps */}
      <div style={{ display: 'flex', gap: '0', alignItems: 'center' }}>
        {steps.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'unset' }}>
            {/* circle */}
            <button
              onClick={s.done ? undefined : s.action}
              style={{
                width: '28px', height: '28px', borderRadius: '50%', border: 'none',
                background: s.done ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#2a2a2a',
                color: s.done ? '#111' : '#555',
                fontWeight: '800', fontSize: '0.75rem',
                cursor: s.done ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s',
                outline: 'none',
                ...(s.done ? {} : { border: '1px solid #3a3a3a' }),
              }}
              title={s.done ? '' : t(`dashboard.onboarding.${s.key}`)}
            >
              {s.done ? '✓' : i + 1}
            </button>

            {/* label */}
            <div
              onClick={s.done ? undefined : s.action}
              style={{
                marginLeft: '0.4rem',
                fontSize: '0.72rem', fontWeight: '600',
                color: s.done ? '#C9A84C' : '#555',
                cursor: s.done ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t(`dashboard.onboarding.${s.key}`)}
            </div>

            {/* connector line */}
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: '1px', margin: '0 0.5rem',
                background: s.done && steps[i + 1].done ? '#C9A84C44' : '#2a2a2a',
              }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const DOC_TYPE_OPTIONS = ['general', 'id', 'financial', 'legal']
const STATUS_STYLE = {
  pending:  { color: '#f39c12', bg: 'rgba(243,156,18,0.1)' },
  approved: { color: '#2ecc71', bg: 'rgba(46,204,113,0.08)' },
  rejected: { color: '#ff6b6b', bg: 'rgba(231,76,60,0.08)' },
}

function DocumentsTab({ t, G, companyId }) {
  const [docs, setDocs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType]     = useState('general')
  const [dragOver, setDragOver]   = useState(false)
  const fileRef                   = useRef()

  const loadDocs = useCallback(async () => {
    try {
      const res = await api.get('/api/documents')
      setDocs(res.data.documents || [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadDocs() }, [loadDocs])

  const uploadFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const form = new FormData()
      Array.from(files).forEach(f => form.append('files', f))
      form.append('docType', docType)
      const res = await api.post('/api/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setDocs(prev => [...(res.data.documents || []), ...prev])
    } catch { /* silent */ }
    finally { setUploading(false) }
  }

  const deleteDoc = async (id) => {
    try {
      await api.delete(`/api/documents/${id}`)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch { /* silent */ }
  }

  if (!companyId) return (
    <div style={{ ...G.card, textAlign: 'center', color: '#555', padding: '3rem' }}>
      {t('dashboard.documents.register_first')}
    </div>
  )

  return (
    <div style={G.card}>
      <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '0.25rem' }}>{t('dashboard.documents.title')}</div>
      <div style={{ color: '#666', fontSize: '0.82rem', marginBottom: '1.5rem' }}>{t('dashboard.documents.subtitle')}</div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#C9A84C' : '#2a2a2a'}`,
          borderRadius: '10px', padding: '2rem', textAlign: 'center',
          cursor: 'pointer', marginBottom: '1rem', transition: 'border-color 0.2s',
          background: dragOver ? 'rgba(201,168,76,0.04)' : 'transparent',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⬆</div>
        <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          {uploading ? t('dashboard.documents.uploading') : t('dashboard.documents.drop_zone')}
        </div>
        <div style={{ color: '#555', fontSize: '0.75rem' }}>PDF, JPEG, PNG, Word · max 10 MB · 5 files</div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" style={{ display: 'none' }}
          onChange={e => { uploadFiles(e.target.files); e.target.value = '' }} />
      </div>

      {/* Doc type selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#666', fontSize: '0.78rem', alignSelf: 'center' }}>{t('dashboard.documents.type_label')}</span>
        {DOC_TYPE_OPTIONS.map(type => (
          <button key={type} onClick={() => setDocType(type)} style={{
            padding: '0.25rem 0.75rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600',
            background: docType === type ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#1f1f1f',
            color: docType === type ? '#111' : '#888',
          }}>
            {t(`dashboard.documents.type_${type}`)}
          </button>
        ))}
      </div>

      {/* Document list */}
      {loading ? (
        <div style={{ color: '#555', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem' }}>…</div>
      ) : docs.length === 0 ? (
        <div style={{ color: '#444', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>{t('dashboard.documents.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {docs.map(doc => {
            const ss = STATUS_STYLE[doc.status] || STATUS_STYLE.pending
            return (
              <div key={doc.id} style={{ background: '#141414', border: '1px solid #222', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <div style={{ color: '#ddd', fontSize: '0.83rem', fontWeight: '600', marginBottom: '0.15rem' }}>{doc.original_name}</div>
                  <div style={{ color: '#555', fontSize: '0.7rem' }}>{doc.doc_type} · {(doc.size_bytes / 1024).toFixed(0)} KB · {new Date(doc.uploaded_at).toLocaleDateString()}</div>
                  {doc.review_note && <div style={{ color: '#777', fontSize: '0.72rem', marginTop: '0.2rem' }}>{doc.review_note}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <span style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.color}44`, borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {doc.status}
                  </span>
                  <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" style={{ color: '#555', fontSize: '0.75rem', border: '1px solid #2a2a2a', padding: '0.2rem 0.5rem', borderRadius: '4px', textDecoration: 'none' }}>↗</a>
                  {doc.status === 'pending' && (
                    <button onClick={() => deleteDoc(doc.id)} style={{ background: 'transparent', color: '#444', border: '1px solid #2a2a2a', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const UPSELL = {
  0: {
    color: '#C9A84C',
    icon: '◆',
    nextLevel: 'Bronze — Level 1',
    perks: ['upsell.l0.perk1', 'upsell.l0.perk2', 'upsell.l0.perk3'],
    planId: null,
  },
  1: {
    color: '#C0C0C0',
    icon: '★',
    nextLevel: 'Silver — Level 2',
    perks: ['upsell.l1.perk1', 'upsell.l1.perk2', 'upsell.l1.perk3'],
    planId: 'level2',
  },
  2: {
    color: '#C9A84C',
    icon: '✔',
    nextLevel: 'Gold — Level 3',
    perks: ['upsell.l2.perk1', 'upsell.l2.perk2', 'upsell.l2.perk3'],
    planId: 'level3',
  },
}

function UpsellBlock({ lvl, t, G, onPricing, onCheckout, checkoutPlanId, companyId }) {
  const u = UPSELL[lvl]
  if (!u) return null
  return (
    <div style={{
      marginTop: '1.25rem',
      background: `linear-gradient(135deg, rgba(20,20,20,1) 0%, rgba(30,25,10,0.9) 100%)`,
      border: `1px solid ${u.color}44`,
      borderRadius: '14px',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg,${u.color},transparent)` }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span style={{ color: u.color, fontSize: '1rem' }}>{u.icon}</span>
            <div style={{ color: '#888', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {t('upsell.next_step')}
            </div>
          </div>
          <div style={{ color: '#fff', fontWeight: '800', fontSize: '1.05rem', marginBottom: '0.5rem' }}>
            {t(`upsell.lvl${lvl}.title`)}
          </div>
          <div style={{ color: '#777', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '1rem' }}>
            {t(`upsell.lvl${lvl}.subtitle`)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {u.perks.map(key => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#aaa', fontSize: '0.8rem' }}>
                <span style={{ color: u.color, fontSize: '0.65rem' }}>✓</span>
                {t(key)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-end' }}>
          <div style={{ color: u.color, fontSize: '1.4rem', fontWeight: '900', lineHeight: 1 }}>
            {lvl === 0 ? '$490' : lvl === 1 ? '$990' : '$2,490'}
          </div>
          <div style={{ color: '#444', fontSize: '0.7rem' }}>{t('upsell.per_year')}</div>
          {u.planId ? (
            <button
              onClick={() => onCheckout(u.planId)}
              disabled={!!checkoutPlanId}
              style={{ ...G.btn, padding: '0.6rem 1.4rem', fontSize: '0.85rem', opacity: checkoutPlanId ? 0.6 : 1, whiteSpace: 'nowrap' }}
            >
              {checkoutPlanId === u.planId ? t('dashboard.pricing.redirecting') : t(`upsell.lvl${lvl}.cta`)}
            </button>
          ) : (
            <button
              onClick={onPricing}
              style={{ ...G.btn, padding: '0.6rem 1.4rem', fontSize: '0.85rem' }}
            >
              {t(`upsell.lvl${lvl}.cta`)}
            </button>
          )}
          {lvl === 0 && companyId == null && (
            <div style={{ color: '#555', fontSize: '0.72rem', textAlign: 'right', maxWidth: '160px' }}>
              {t('upsell.register_first')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmailVerifyBanner({ t }) {
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)

  const resend = async () => {
    setSending(true)
    try {
      await api.post('/api/auth/resend-verification')
      setSent(true)
    } catch { /* silent */ }
    finally { setSending(false) }
  }

  return (
    <div style={{
      background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.25)',
      borderRadius: '10px', padding: '0.85rem 1.25rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.1rem' }}>✉</span>
        <div>
          <div style={{ color: '#C9A84C', fontSize: '0.82rem', fontWeight: '700' }}>{t('dashboard.verify_email.title')}</div>
          <div style={{ color: '#888', fontSize: '0.78rem', marginTop: '0.1rem' }}>{t('dashboard.verify_email.desc')}</div>
        </div>
      </div>
      {!sent ? (
        <button
          onClick={resend}
          disabled={sending}
          style={{ background: 'transparent', color: '#C9A84C', border: '1px solid rgba(201,168,76,0.4)', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', opacity: sending ? 0.6 : 1, whiteSpace: 'nowrap' }}
        >
          {sending ? '…' : t('dashboard.verify_email.resend')}
        </button>
      ) : (
        <span style={{ color: '#2ecc71', fontSize: '0.78rem', fontWeight: '600' }}>{t('dashboard.verify_email.sent')}</span>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('overview')
  const [company, setCompany] = useState(null)
  const [user, setUser] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [paymentError, setPaymentError] = useState('')
  const [checkoutPlanId, setCheckoutPlanId] = useState('')
  const [copied, setCopied] = useState(false)
  const [toasts,         showToast]         = useToast()
  const [billingLoading, setBillingLoading] = useState(false)
  const navigate = useNavigate()

  const PLANS = [
    { id: 'level1', name: t('dashboard.pricing.plans.level1_name'), price: t('dashboard.pricing.plans.level1_price'), features: [t('dashboard.pricing.plans.level1_f1'), t('dashboard.pricing.plans.level1_f2'), t('dashboard.pricing.plans.level1_f3'), t('dashboard.pricing.plans.level1_f4')] },
    { id: 'level2', name: t('dashboard.pricing.plans.level2_name'), price: t('dashboard.pricing.plans.level2_price'), features: [t('dashboard.pricing.plans.level2_f1'), t('dashboard.pricing.plans.level2_f2'), t('dashboard.pricing.plans.level2_f3'), t('dashboard.pricing.plans.level2_f4'), t('dashboard.pricing.plans.level2_f5')] },
    { id: 'level3', name: t('dashboard.pricing.plans.level3_name'), price: t('dashboard.pricing.plans.level3_price'), features: [t('dashboard.pricing.plans.level3_f1'), t('dashboard.pricing.plans.level3_f2'), t('dashboard.pricing.plans.level3_f3'), t('dashboard.pricing.plans.level3_f4'), t('dashboard.pricing.plans.level3_f5'), t('dashboard.pricing.plans.level3_f6')] },
  ]

  useEffect(() => {
    const user = getSession()
    if (!user) { navigate('/login'); return }
    const role = user.role
    if (role === 'pac')    { navigate('/pac');    return }
    if (role === 'admin')  { navigate('/admin');  return }
    if (role === 'trader') { navigate('/trader'); return }
    document.title = 'Dashboard — MyDD'
    fetchProfile()
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      setTab('overview')
      window.history.replaceState({}, '', '/dashboard')
      fetchProfile()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Per-user WebSocket notifications (cert_granted, mission_assigned)
  useEffect(() => {
    // WebSocket auth is cookie-based — no token needed in URL
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let ws
    try {
      ws = new WebSocket(`${proto}//${window.location.host}/ws/metrics`)
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'cert_granted') {
            showToast(`🏅 Certification Level ${msg.level} granted! View your badge.`, 'success')
            fetchProfile()
          } else if (msg.type === 'mission_assigned') {
            showToast(`📋 New mission assigned: ${msg.missionTitle || 'check your missions'}`, 'info')
          }
        } catch { /* invalid frame */ }
      }
    } catch { /* WS unavailable */ }
    return () => { if (ws) ws.close() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/companies/me')
      setCompany(res.data.company)
      setUser(res.data.user)
    } catch {
      navigate('/login')
    } finally {
      setLoadingProfile(false)
    }
  }

  const handleCheckout = async (planId) => {
    setPaymentError('')
    setCheckoutPlanId(planId)
    try {
      const res = await api.post('/api/payments/create-checkout-session', { planId })
      window.location.href = res.data.url
    } catch (err) {
      setPaymentError(err.response?.data?.error || 'Payment initialization failed. Please try again.')
    } finally {
      setCheckoutPlanId('')
    }
  }

  const handleBillingPortal = async () => {
    setBillingLoading(true)
    try {
      const res = await api.post('/api/payments/portal')
      window.location.href = res.data.url
    } catch (err) {
      showToast(err.response?.data?.error || 'No billing account found', 'error')
    } finally {
      setBillingLoading(false)
    }
  }


  const handleLogout = async () => {
    try { await api.post('/api/auth/logout') } catch { /* best-effort */ }
    clearSession()
    navigate('/login')
  }

  const isMobile = useMobile()

  const G = {
    page: { minHeight: '100vh', background: '#111', fontFamily: 'sans-serif', color: '#eee' },
    nav: { background: '#1a1a1a', borderBottom: '1px solid #333', padding: isMobile ? '0 1rem' : '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' },
    logo: { color: '#C9A84C', fontWeight: '900', fontSize: '1.2rem', letterSpacing: '0.1em' },
    main: { maxWidth: '1100px', margin: '0 auto', padding: isMobile ? '1.25rem 0.75rem' : '2rem 1.5rem' },
    card: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: isMobile ? '1rem' : '1.5rem', marginBottom: '1.5rem' },
    tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '4px' },
    planCard: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', flex: '1', minWidth: '240px', display: 'flex', flexDirection: 'column' },
    btn: { background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.6rem 1.2rem', borderRadius: '6px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
    outlineBtn: { background: 'transparent', color: '#C9A84C', padding: '0.6rem 1.2rem', borderRadius: '6px', border: '1px solid #C9A84C', fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  }

  const lvl = company?.certificationLevel || 0
  const lconf = LEVEL_CONFIG[lvl] || LEVEL_CONFIG[0]

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={tab === id ? { ...G.btn } : { ...G.outlineBtn }}>
      {label}
    </button>
  )

  // ── Skeleton overview ──────────────────────────────────────────────────────
  const OverviewSkeleton = () => (
    <div>
      <div style={G.card}>
        <Skeleton height="1.5rem" width="55%" style={{ marginBottom: '0.6rem' }} />
        <Skeleton height="0.875rem" width="30%" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={G.card}>
            <Skeleton height="0.7rem" width="60%" style={{ marginBottom: '0.75rem' }} />
            <Skeleton height="1.25rem" width="40%" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={G.page}>
      <nav style={G.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '6px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '0.85rem', flexShrink: 0 }}>M</div>
          <div>
            <div style={{ color: '#fff', fontWeight: '800', fontSize: '1rem', letterSpacing: '-0.01em', lineHeight: 1.1 }}>MyDD</div>
            <div style={{ color: '#444', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('brand.tagline_short')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem' }}>
          <LanguageSwitcher />
          {!isMobile && <span style={{ color: '#666', fontSize: '0.8rem' }}>{user?.name || user?.email}</span>}
          {lvl > 0 && (
            <button onClick={handleBillingPortal} disabled={billingLoading} style={{ background: 'transparent', color: '#555', border: '1px solid #2a2a2a', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', opacity: billingLoading ? 0.5 : 1 }}>
              {billingLoading ? '…' : t('dashboard.billing')}
            </button>
          )}
          <button onClick={handleLogout} style={{ ...G.outlineBtn, padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}>{t('nav.logout')}</button>
        </div>
      </nav>

      <main style={G.main}>
        {/* ── Email verification banner ─────────────────────────────────────── */}
        {user && user.emailVerified === false && (
          <EmailVerifyBanner t={t} />
        )}

        <div style={G.tabs} className="scroll-x">
          <TabBtn id="overview"   label={t('dashboard.tabs.overview')} />
          <TabBtn id="register"   label={t('dashboard.tabs.register')} />
          <TabBtn id="pricing"    label={t('dashboard.tabs.pricing')} />
          <TabBtn id="documents"  label={t('dashboard.tabs.documents')} />
          <TabBtn id="billing"    label={t('dashboard.tabs.billing', 'Billing')} />
          <TabBtn id="developer"  label={t('dashboard.tabs.developer', 'Developer')} />
          <TabBtn id="metrics"    label={t('dashboard.tabs.metrics')} />
        </div>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          loadingProfile ? <OverviewSkeleton /> : (
            <div>
              {/* Onboarding progress — only until certified */}
              {lvl === 0 && (
                <OnboardingProgress
                  company={company}
                  certLevel={lvl}
                  t={t}
                  onRegister={() => setTab('register')}
                  onPricing={() => setTab('pricing')}
                />
              )}

              <div style={G.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>{company?.name || 'Your Company'}</div>
                    <div style={{ color: '#888', fontSize: '0.875rem' }}>{company?.industry || ''}</div>
                  </div>
                  <div style={{ background: lconf.bg, border: '1px solid ' + lconf.color, borderRadius: '20px', padding: '0.35rem 1rem', color: lconf.color, fontWeight: '600', fontSize: '0.875rem' }}>
                    {t(`dashboard.cert_levels.${lvl}`)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem' }}>
                {[
                  { label: t('dashboard.overview.cert_level'),      value: lvl > 0 ? 'Level ' + lvl : t('dashboard.overview.cert_none'), color: lconf.color },
                  { label: t('dashboard.overview.registry_status'), value: company ? t('dashboard.overview.status_active') : t('dashboard.overview.status_not_registered'), color: '#4CAF50' },
                  { label: t('dashboard.overview.verification'),    value: company?.verifiedAt ? t('dashboard.overview.status_verified') : t('dashboard.overview.status_pending'), color: company?.verifiedAt ? '#4CAF50' : '#888' },
                ].map(item => (
                  <div key={item.label} style={G.card}>
                    <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                    <div style={{ color: item.color, fontSize: '1.25rem', fontWeight: '700' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Cert expiry banner */}
              {company?.certInfo && (
                <div style={{ ...G.card, marginTop: '1rem',
                  background: company.certInfo.expired ? 'rgba(231,76,60,0.08)' : company.certInfo.expiringSoon ? 'rgba(243,156,18,0.08)' : 'rgba(46,204,113,0.06)',
                  border: `1px solid ${company.certInfo.expired ? 'rgba(231,76,60,0.4)' : company.certInfo.expiringSoon ? 'rgba(243,156,18,0.4)' : 'rgba(46,204,113,0.3)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ color: '#aaa', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>{t('dashboard.overview.cert_validity')}</div>
                      <div style={{ fontWeight: '700', color: company.certInfo.expired ? '#ff6b6b' : company.certInfo.expiringSoon ? '#f39c12' : '#2ecc71', fontSize: '0.95rem' }}>
                        {company.certInfo.expired
                          ? t('dashboard.overview.cert_expired')
                          : company.certInfo.expiringSoon
                            ? `${t('dashboard.overview.cert_expiring')} ${company.certInfo.daysLeft} ${t('dashboard.overview.days')}`
                            : `${t('dashboard.overview.cert_valid_until')} ${new Date(company.certInfo.expiresAt).toLocaleDateString()}`
                        }
                      </div>
                    </div>
                    {company.id && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {(company.certInfo.expired || company.certInfo.expiringSoon) && (
                          <button
                            onClick={() => handleCheckout(`level${company.certInfo.level}`)}
                            disabled={!!checkoutPlanId}
                            style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', border: 'none', padding: '0.4rem 0.9rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700' }}
                          >
                            {checkoutPlanId ? t('dashboard.pricing.redirecting') : t('dashboard.overview.renew')}
                          </button>
                        )}
                        <a href={`/verify/${company.id}`} target="_blank" rel="noreferrer" style={{ color: '#C9A84C', fontSize: '0.8rem', fontWeight: '600', textDecoration: 'none', border: '1px solid #C9A84C44', padding: '0.4rem 0.8rem', borderRadius: '6px' }}>
                          {t('dashboard.overview.view_cert')} →
                        </a>
                        <a href={`/verify/${company.id}/print`} target="_blank" rel="noreferrer" style={{ color: '#888', fontSize: '0.8rem', fontWeight: '500', textDecoration: 'none', border: '1px solid #2a2a2a', padding: '0.4rem 0.8rem', borderRadius: '6px' }}>
                          ⊞ {t('dashboard.overview.print_cert')}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/verify/${company.id}`)
                            setCopied(true)
                            showToast(t('dashboard.overview.copied'), 'info')
                            setTimeout(() => setCopied(false), 2000)
                          }}
                          style={{ background: 'transparent', color: copied ? '#2ecc71' : '#555', border: '1px solid #2a2a2a', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          {copied ? '✓ ' + t('dashboard.overview.copied') : '⎘ ' + t('dashboard.overview.copy_link')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Contextual upsell (L0, L1, L2) ─────────────────────────── */}
              {lvl < 3 && (
                <UpsellBlock lvl={lvl} t={t} G={G}
                  onPricing={() => setTab('pricing')}
                  onCheckout={handleCheckout}
                  checkoutPlanId={checkoutPlanId}
                  companyId={company?.id}
                />
              )}
            </div>
          )
        )}

        {/* ── Register ─────────────────────────────────────────────────────── */}
        {tab === 'register' && (
          <RegisterCompanyForm
            company={company}
            onSaved={(c) => {
              setCompany(c)
              setTab('overview')
              showToast(t('dashboard.company_form.saved'))
            }}
            onError={(msg) => showToast(msg, 'error')}
          />
        )}

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        {tab === 'pricing' && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem' }}>{t('dashboard.pricing.title')}</div>
              <div style={{ color: '#888', fontSize: '0.875rem' }}>{t('dashboard.pricing.subtitle')}</div>
            </div>
            {!company && (
              <div style={{ ...G.card, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.35)', marginBottom: '1rem' }}>
                <div style={{ color: '#C9A84C', fontWeight: '700', marginBottom: '0.4rem' }}>{t('dashboard.pricing.complete_profile')}</div>
                <div style={{ color: '#aaa', fontSize: '0.875rem' }}>{t('dashboard.pricing.complete_profile_desc')}</div>
              </div>
            )}
            {paymentError && (
              <div style={{ ...G.card, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.35)', marginBottom: '1rem', color: '#ff7f7f' }}>
                {paymentError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {PLANS.map((plan, i) => (
                <div key={plan.id} style={{ ...G.planCard, ...(i === 2 ? { border: '1px solid #C9A84C', boxShadow: '0 0 20px rgba(201,168,76,0.15)' } : {}) }}>
                  {i === 2 && <div style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>{t('dashboard.pricing.most_popular')}</div>}
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.25rem' }}>{plan.name}</div>
                  <div style={{ fontSize: '2rem', fontWeight: '900', color: '#C9A84C', marginBottom: '1rem' }}>
                    {plan.price}<span style={{ fontSize: '0.875rem', color: '#666', fontWeight: '400' }}>{t('dashboard.pricing.per_year')}</span>
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', flex: 1 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ color: '#bbb', fontSize: '0.875rem', padding: '0.3rem 0', borderBottom: '1px solid #2a2a2a' }}>
                        <span style={{ color: '#C9A84C', marginRight: '0.5rem' }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  <button
                    style={{ ...G.btn, opacity: lvl >= (i + 1) || !company ? 0.5 : 1, cursor: lvl >= (i + 1) || !company ? 'default' : 'pointer' }}
                    onClick={() => lvl < (i + 1) && company && handleCheckout(plan.id)}
                    disabled={lvl >= (i + 1) || !company || checkoutPlanId === plan.id}
                  >
                    {checkoutPlanId === plan.id ? t('dashboard.pricing.redirecting') : (lvl >= (i + 1) ? t('dashboard.pricing.current_plan') : t('dashboard.pricing.get_certified'))}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Documents ────────────────────────────────────────────────────── */}
        {tab === 'documents' && (
          <DocumentsTab t={t} G={G} companyId={company?.id} />
        )}

        {/* ── Billing ──────────────────────────────────────────────────────── */}
        {tab === 'billing' && (
          <BillingTab G={G} t={t} onManageBilling={handleBillingPortal} billingLoading={billingLoading} />
        )}

        {/* ── Developer ────────────────────────────────────────────────────── */}
        {tab === 'developer' && (
          <DeveloperTab G={G} t={t} />
        )}

        {/* ── Metrics ──────────────────────────────────────────────────────── */}
        {tab === 'metrics' && (
          <div style={G.card}>
            <MetricsDashboard />
          </div>
        )}
      </main>

      <ToastContainer toasts={toasts} />
    </div>
  )
}

// ── BillingTab ────────────────────────────────────────────────────────────────
function BillingTab({ G, t, onManageBilling, billingLoading }) {
  const [payments, setPayments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const isMobile = useMobile()

  useEffect(() => {
    api.get('/api/payments/history')
      .then(res => setPayments(res.data.payments || []))
      .catch(() => setError('Impossible de charger l\'historique.'))
      .finally(() => setLoading(false))
  }, [])

  const STATUS_STYLE = {
    completed: { color: '#2ecc71', bg: 'rgba(46,204,113,0.1)',  label: 'Payé'    },
    pending:   { color: '#f39c12', bg: 'rgba(243,156,18,0.1)',  label: 'En cours' },
    failed:    { color: '#ff6b6b', bg: 'rgba(231,76,60,0.1)',   label: 'Échoué'  },
    refunded:  { color: '#9b59b6', bg: 'rgba(155,89,182,0.1)',  label: 'Remboursé'},
  }

  return (
    <div style={G.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#eee', marginBottom: '0.2rem' }}>
            {t('dashboard.billing_title', 'Historique des paiements')}
          </div>
          <div style={{ color: '#555', fontSize: '0.8rem' }}>
            {t('dashboard.billing_subtitle', 'Vos certifications et transactions Stripe')}
          </div>
        </div>
        <button
          onClick={onManageBilling}
          disabled={billingLoading}
          style={{ ...G.outlineBtn, fontSize: '0.82rem', opacity: billingLoading ? 0.5 : 1 }}
        >
          {billingLoading ? '…' : '⎘ ' + t('dashboard.billing', 'Gérer l\'abonnement')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1,2,3].map(i => <Skeleton key={i} height="56px" style={{ borderRadius: '8px' }} />)}
        </div>
      ) : error ? (
        <div style={{ color: '#ff6b6b', fontSize: '0.875rem', padding: '1rem', background: 'rgba(231,76,60,0.08)', borderRadius: '8px' }}>{error}</div>
      ) : payments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#444' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💳</div>
          <div style={{ fontWeight: '600', color: '#666', marginBottom: '0.3rem' }}>
            {t('dashboard.billing_empty', 'Aucun paiement enregistré')}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#444' }}>
            {t('dashboard.billing_empty_sub', 'Vos transactions apparaîtront ici après la certification.')}
          </div>
        </div>
      ) : (
        <div>
          {/* Summary row */}
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Total payé', value: '$' + payments.filter(p => p.status === 'completed').reduce((s, p) => s + parseFloat(p.amount_usd), 0).toFixed(2), color: '#C9A84C' },
              { label: 'Transactions', value: payments.length, color: '#eee' },
              { label: 'Dernière', value: payments[0] ? new Date(payments[0].created_at).toLocaleDateString('fr-FR') : '—', color: '#aaa' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#1a1a1a', padding: '0.75rem 1.25rem', borderRadius: '8px', border: '1px solid #222', flex: 1, minWidth: '110px' }}>
                <div style={{ color: '#555', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{label}</div>
                <div style={{ color, fontWeight: '700', fontSize: '1.1rem' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Payment rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {payments.map(p => {
              const s = STATUS_STYLE[p.status] || STATUS_STYLE.pending
              return isMobile ? (
                <div key={p.id} style={{ padding: '0.85rem 1rem', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #222' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ color: '#eee', fontWeight: '600', fontSize: '0.875rem' }}>{p.plan_label}</div>
                    <div style={{ color: '#C9A84C', fontWeight: '700', fontSize: '0.95rem' }}>${p.amount_usd}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: '#555', fontSize: '0.75rem' }}>
                      {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700', background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {s.label}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 1rem', background: '#1a1a1a', borderRadius: '8px', border: '1px solid #222' }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ color: '#eee', fontWeight: '600', fontSize: '0.875rem' }}>{p.plan_label}</div>
                    <div style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                      {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ display: 'inline-block', padding: '0.25rem 0.7rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {s.label}
                  </div>
                  <div style={{ color: '#C9A84C', fontWeight: '700', fontSize: '0.95rem', minWidth: '70px', textAlign: 'right' }}>
                    ${p.amount_usd}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── DeveloperTab ──────────────────────────────────────────────────────────────
const ALLOWED_EVENTS = ['cert.status_changed', 'cert.issued', 'cert.expired', 'cert.revoked']

function DeveloperTab({ G, t }) {
  // ── API Keys state ────────────────────────────────────────────────────────
  const [keys, setKeys]           = useState([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [keyName, setKeyName]     = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [newKey, setNewKey]       = useState(null)   // { id, prefix, key }
  const [keyErr, setKeyErr]       = useState(null)
  const [revokingId, setRevokingId] = useState(null)

  // ── Webhooks state ────────────────────────────────────────────────────────
  const [hooks, setHooks]         = useState([])
  const [hooksLoading, setHooksLoading] = useState(true)
  const [hookUrl, setHookUrl]     = useState('')
  const [hookEvents, setHookEvents] = useState(['cert.status_changed'])
  const [hookDesc, setHookDesc]   = useState('')
  const [creatingHook, setCreatingHook] = useState(false)
  const [newHook, setNewHook]     = useState(null)   // { id, url, secret }
  const [hookErr, setHookErr]     = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [pingingId, setPingingId]  = useState(null)
  const [pingResult, setPingResult] = useState({})

  const fetchKeys = useCallback(() => {
    setKeysLoading(true)
    api.get('/api/keys')
      .then(r => setKeys(r.data.data || []))
      .catch(() => setKeyErr(t('dev.keys_load_error', 'Failed to load API keys.')))
      .finally(() => setKeysLoading(false))
  }, [t])

  const fetchHooks = useCallback(() => {
    setHooksLoading(true)
    api.get('/api/webhooks')
      .then(r => setHooks(r.data.data || []))
      .catch(() => setHookErr(t('dev.hooks_load_error', 'Failed to load webhooks.')))
      .finally(() => setHooksLoading(false))
  }, [t])

  useEffect(() => { fetchKeys(); fetchHooks() }, [fetchKeys, fetchHooks])

  const createKey = async () => {
    if (!keyName.trim()) return
    setCreatingKey(true); setKeyErr(null); setNewKey(null)
    try {
      const r = await api.post('/api/keys', { name: keyName.trim() })
      setNewKey(r.data)
      setKeyName('')
      fetchKeys()
    } catch (e) {
      setKeyErr(e.response?.data?.error || t('dev.key_create_error', 'Failed to create key.'))
    } finally { setCreatingKey(false) }
  }

  const revokeKey = async (id) => {
    setRevokingId(id)
    try {
      await api.delete(`/api/keys/${id}`)
      setKeys(prev => prev.filter(k => k.id !== id))
    } catch { /* ignore */ }
    finally { setRevokingId(null) }
  }

  const createHook = async () => {
    if (!hookUrl.trim()) return
    setCreatingHook(true); setHookErr(null); setNewHook(null)
    try {
      const r = await api.post('/api/webhooks', {
        url: hookUrl.trim(),
        events: hookEvents,
        description: hookDesc.trim() || undefined,
      })
      setNewHook(r.data)
      setHookUrl(''); setHookDesc(''); setHookEvents(['cert.status_changed'])
      fetchHooks()
    } catch (e) {
      setHookErr(e.response?.data?.error || t('dev.hook_create_error', 'Failed to register webhook.'))
    } finally { setCreatingHook(false) }
  }

  const deleteHook = async (id) => {
    setDeletingId(id)
    try {
      await api.delete(`/api/webhooks/${id}`)
      setHooks(prev => prev.filter(h => h.id !== id))
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }

  const pingHook = async (id) => {
    setPingingId(id); setPingResult(prev => ({ ...prev, [id]: null }))
    try {
      const r = await api.post(`/api/webhooks/${id}/ping`)
      const { success, statusCode, error: pingErr } = r.data
      setPingResult(prev => ({ ...prev, [id]: { ok: success, statusCode, msg: pingErr } }))
    } catch (e) {
      setPingResult(prev => ({ ...prev, [id]: { ok: false, msg: e.response?.data?.error || 'Ping failed' } }))
    } finally { setPingingId(null) }
  }

  const toggleEvent = (ev) => {
    setHookEvents(prev =>
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    )
  }

  const D = {
    section: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' },
    h2:      { fontSize: '1rem', fontWeight: '700', color: '#eee', marginBottom: '0.25rem' },
    sub:     { color: '#555', fontSize: '0.8rem', marginBottom: '1.25rem' },
    row:     { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#111', borderRadius: '8px', border: '1px solid #222', marginBottom: '0.5rem', flexWrap: 'wrap' },
    inp:     { flex: 1, minWidth: '180px', padding: '0.55rem 0.9rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.875rem' },
    secret:  { fontFamily: 'monospace', fontSize: '0.8rem', color: '#2ecc71', background: 'rgba(46,204,113,0.08)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(46,204,113,0.2)', wordBreak: 'break-all', marginTop: '0.75rem', position: 'relative' },
    warn:    { background: 'rgba(243,156,18,0.08)', border: '1px solid rgba(243,156,18,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#f39c12', fontSize: '0.82rem', marginBottom: '0.75rem' },
    badge:   { display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700', background: 'rgba(201,168,76,0.12)', color: '#C9A84C', marginRight: '0.3rem' },
    err:     { color: '#ff6b6b', fontSize: '0.82rem', marginBottom: '0.75rem', background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '6px', padding: '0.6rem 0.9rem' },
  }

  const CopyBox = ({ value, label }) => {
    const [copied, setCopied] = useState(false)
    const copy = () => {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
    return (
      <div style={D.secret}>
        <div style={{ color: '#888', fontSize: '0.7rem', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ wordBreak: 'break-all' }}>{value}</div>
        <button onClick={copy} style={{ marginTop: '0.5rem', background: copied ? 'rgba(46,204,113,0.15)' : '#2a2a2a', border: '1px solid #333', color: copied ? '#2ecc71' : '#aaa', padding: '0.3rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* ── API Keys ──────────────────────────────────────────────────────── */}
      <div style={D.section}>
        <div style={D.h2}>🔑 {t('dev.keys_title', 'API Keys')}</div>
        <div style={D.sub}>{t('dev.keys_desc', 'Use API keys to access the MyDD REST API from your systems. The raw key is shown only once — store it securely.')}</div>

        {/* Create form */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            style={D.inp}
            placeholder={t('dev.key_name_placeholder', 'Key name (e.g. "Production backend")')}
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createKey()}
            maxLength={80}
          />
          <button
            onClick={createKey}
            disabled={creatingKey || !keyName.trim()}
            style={{ ...G.btn, opacity: creatingKey || !keyName.trim() ? 0.5 : 1 }}
          >
            {creatingKey ? '…' : t('dev.create_key', 'Create key')}
          </button>
        </div>

        {keyErr && <div style={D.err}>{keyErr}</div>}

        {/* One-time reveal */}
        {newKey && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={D.warn}>⚠️ {t('dev.key_once_warning', 'Copy this key now — it will never be shown again.')}</div>
            <CopyBox value={newKey.key} label={t('dev.api_key', 'API Key')} />
          </div>
        )}

        {/* List */}
        {keysLoading ? (
          <div style={{ color: '#555', fontSize: '0.85rem' }}>Loading…</div>
        ) : keys.length === 0 ? (
          <div style={{ color: '#444', fontSize: '0.85rem', padding: '1.5rem', textAlign: 'center', background: '#111', borderRadius: '8px', border: '1px solid #1f1f1f' }}>
            {t('dev.keys_empty', 'No API keys yet. Create one above.')}
          </div>
        ) : (
          <div>
            {keys.map(k => (
              <div key={k.id} style={D.row}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <div style={{ color: '#eee', fontWeight: '600', fontSize: '0.875rem' }}>{k.name}</div>
                  <div style={{ color: '#555', fontSize: '0.72rem', marginTop: '0.15rem', fontFamily: 'monospace' }}>
                    {k.prefix}…
                    {k.last_used_at && (
                      <span style={{ marginLeft: '0.75rem', color: '#444' }}>
                        {t('dev.last_used', 'Last used')}: {new Date(k.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {(k.scopes || []).length > 0 && (
                  <div>
                    {k.scopes.map(s => <span key={s} style={D.badge}>{s}</span>)}
                  </div>
                )}
                <div style={{ color: '#444', fontSize: '0.75rem' }}>
                  {new Date(k.created_at).toLocaleDateString()}
                </div>
                <button
                  onClick={() => revokeKey(k.id)}
                  disabled={revokingId === k.id}
                  style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.25)', color: '#ff6b6b', padding: '0.3rem 0.8rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                >
                  {revokingId === k.id ? '…' : t('dev.revoke', 'Revoke')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Webhooks ──────────────────────────────────────────────────────── */}
      <div style={D.section}>
        <div style={D.h2}>🔗 {t('dev.hooks_title', 'Webhooks')}</div>
        <div style={D.sub}>{t('dev.hooks_desc', 'Register HTTPS endpoints to receive real-time events when your certification status changes. The signing secret is shown only once.')}</div>

        {/* Register form */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input
              style={{ ...D.inp, flexBasis: '280px' }}
              placeholder="https://your-server.com/webhook"
              value={hookUrl}
              onChange={e => setHookUrl(e.target.value)}
              maxLength={500}
            />
            <input
              style={{ ...D.inp, flexBasis: '180px' }}
              placeholder={t('dev.hook_desc_placeholder', 'Description (optional)')}
              value={hookDesc}
              onChange={e => setHookDesc(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Events checkboxes */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {ALLOWED_EVENTS.map(ev => (
              <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', padding: '0.3rem 0.7rem', borderRadius: '6px', border: `1px solid ${hookEvents.includes(ev) ? '#C9A84C' : '#2a2a2a'}`, background: hookEvents.includes(ev) ? 'rgba(201,168,76,0.08)' : '#111', fontSize: '0.78rem', color: hookEvents.includes(ev) ? '#C9A84C' : '#555' }}>
                <input
                  type="checkbox"
                  checked={hookEvents.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  style={{ accentColor: '#C9A84C', margin: 0 }}
                />
                {ev}
              </label>
            ))}
          </div>

          <button
            onClick={createHook}
            disabled={creatingHook || !hookUrl.trim() || hookEvents.length === 0}
            style={{ ...G.btn, opacity: creatingHook || !hookUrl.trim() || hookEvents.length === 0 ? 0.5 : 1 }}
          >
            {creatingHook ? '…' : t('dev.register_hook', 'Register endpoint')}
          </button>
        </div>

        {hookErr && <div style={D.err}>{hookErr}</div>}

        {/* One-time reveal */}
        {newHook && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={D.warn}>⚠️ {t('dev.hook_once_warning', 'Copy the signing secret now — it will never be shown again. Use it to verify X-MyDD-Signature on incoming requests.')}</div>
            <CopyBox value={newHook.secret} label={t('dev.signing_secret', 'Signing Secret')} />
          </div>
        )}

        {/* List */}
        {hooksLoading ? (
          <div style={{ color: '#555', fontSize: '0.85rem' }}>Loading…</div>
        ) : hooks.length === 0 ? (
          <div style={{ color: '#444', fontSize: '0.85rem', padding: '1.5rem', textAlign: 'center', background: '#111', borderRadius: '8px', border: '1px solid #1f1f1f' }}>
            {t('dev.hooks_empty', 'No webhook endpoints yet. Register one above.')}
          </div>
        ) : (
          <div>
            {hooks.map(h => (
              <div key={h.id} style={{ ...D.row, flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Status dot */}
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: h.active ? '#2ecc71' : '#555', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ color: '#eee', fontWeight: '600', fontSize: '0.875rem', fontFamily: 'monospace' }}>{h.url}</div>
                    {h.description && (
                      <div style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.1rem' }}>{h.description}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {(h.events || []).map(ev => <span key={ev} style={D.badge}>{ev}</span>)}
                  </div>
                  <div style={{ color: '#444', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                    {parseInt(h.deliveries_success, 10)}/{parseInt(h.deliveries_total, 10)} ok
                  </div>
                  <button
                    onClick={() => pingHook(h.id)}
                    disabled={pingingId === h.id || !h.active}
                    style={{ background: '#1f1f1f', border: '1px solid #333', color: '#aaa', padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: h.active ? 'pointer' : 'not-allowed', opacity: h.active ? 1 : 0.4 }}
                  >
                    {pingingId === h.id ? '…' : '▶ Ping'}
                  </button>
                  <button
                    onClick={() => deleteHook(h.id)}
                    disabled={deletingId === h.id}
                    style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.25)', color: '#ff6b6b', padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                  >
                    {deletingId === h.id ? '…' : t('dev.delete', 'Delete')}
                  </button>
                </div>
                {pingResult[h.id] && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', background: pingResult[h.id].ok ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)', border: `1px solid ${pingResult[h.id].ok ? 'rgba(46,204,113,0.2)' : 'rgba(231,76,60,0.2)'}`, color: pingResult[h.id].ok ? '#2ecc71' : '#ff6b6b' }}>
                    {pingResult[h.id].ok
                      ? `✓ Ping delivered — HTTP ${pingResult[h.id].statusCode}`
                      : `✗ ${pingResult[h.id].msg || `HTTP ${pingResult[h.id].statusCode || 'error'}`}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Docs hint */}
        <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#111', borderRadius: '8px', border: '1px solid #1f1f1f', fontSize: '0.78rem', color: '#555' }}>
          <strong style={{ color: '#888' }}>Verify signatures:</strong>{' '}
          {t('dev.sig_hint', 'Compute HMAC-SHA256 of the raw request body using your signing secret and compare with the X-MyDD-Signature header.')}
        </div>
      </div>
    </div>
  )
}

// ── RegisterCompanyForm ───────────────────────────────────────────────────────
function RegisterCompanyForm({ company, onSaved, onError }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    name:        company?.companyName  || company?.name        || '',
    sector:      company?.sector       || company?.industry    || '',
    country:     company?.country      || '',
    description: company?.description  || '',
    website:     company?.website      || '',
  })
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true); setErrMsg('')
    try {
      const res = await api.post('/api/companies/register', form)
      onSaved(res.data.company)
    } catch (err) {
      const msg = err.response?.data?.error || 'Save failed'
      setErrMsg(msg)
      if (onError) onError(msg)
    } finally { setSaving(false) }
  }

  const G = {
    card: { background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1.5rem', maxWidth: '640px' },
    lbl:  { display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#888', marginBottom: '0.35rem', letterSpacing: '0.05em', textTransform: 'uppercase' },
    inp:  { width: '100%', padding: '0.65rem 1rem', background: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', marginBottom: '1rem', boxSizing: 'border-box' },
    btn:  { background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.7rem 1.5rem', borderRadius: '6px', border: 'none', fontWeight: '700', cursor: 'pointer' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '0 1rem' },
  }

  return (
    <div style={G.card}>
      <div style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '1.25rem' }}>{t('dashboard.company_form.title')}</div>
      {errMsg && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem 1rem', borderRadius: '8px', fontSize: '0.875rem', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', color: '#ff6b6b' }}>
          {errMsg}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <label style={G.lbl}>{t('dashboard.company_form.company_name')} *</label>
        <input style={G.inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />

        <div style={G.grid}>
          <div>
            <label style={G.lbl}>{t('dashboard.company_form.sector')}</label>
            <input style={G.inp} placeholder={t('dashboard.company_form.sector_placeholder')} value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} />
          </div>
          <div>
            <label style={G.lbl}>{t('dashboard.company_form.country')}</label>
            <input style={G.inp} placeholder={t('dashboard.company_form.country_placeholder')} value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
          </div>
        </div>

        <label style={G.lbl}>{t('dashboard.company_form.website')}</label>
        <input style={G.inp} type="url" placeholder="https://" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />

        <label style={G.lbl}>{t('dashboard.company_form.description')}</label>
        <textarea style={{ ...G.inp, minHeight: '90px', resize: 'vertical', marginBottom: '1.25rem' }} placeholder={t('dashboard.company_form.description_placeholder')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />

        <button style={G.btn} type="submit" disabled={saving}>{saving ? t('dashboard.company_form.saving') : t('dashboard.company_form.save')}</button>
      </form>
    </div>
  )
}
