/**
 * Onboarding.jsx — New company welcome wizard
 *
 * 3-step guided flow shown to companies that just registered or
 * have not yet completed their profile.
 *
 * Steps:
 *  1. Company profile (name, sector, country, website)
 *  2. Document checklist (informational — links to Dashboard docs tab)
 *  3. Choose certification level + CTA
 *
 * Skippable — stores completion in localStorage (key: mydd_onboarding_done).
 * Redirects to /dashboard on finish.
 */
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { getSession } from '../lib/session'

const ONBOARDING_KEY = 'mydd_onboarding_done'

const SECTORS = [
  'Manufacturing', 'Logistics', 'Agribusiness', 'Technology',
  'Trade Finance', 'Construction', 'Energy', 'Healthcare',
  'Retail', 'Services', 'Other',
]

const COUNTRIES = [
  'AE', 'FR', 'DE', 'GB', 'US', 'CN', 'IN', 'BR', 'NG', 'ZA',
  'MA', 'EG', 'SN', 'CI', 'GH', 'KE', 'TN', 'DZ', 'SG', 'HK',
  'TR', 'PK', 'BD', 'TH', 'VN', 'ID', 'PH', 'MX', 'AR', 'CO',
]

const COUNTRY_NAMES = {
  AE:'United Arab Emirates', FR:'France', DE:'Germany', GB:'United Kingdom',
  US:'United States', CN:'China', IN:'India', BR:'Brazil', NG:'Nigeria',
  ZA:'South Africa', MA:'Morocco', EG:'Egypt', SN:'Senegal', CI:"Côte d'Ivoire",
  GH:'Ghana', KE:'Kenya', TN:'Tunisia', DZ:'Algeria', SG:'Singapore', HK:'Hong Kong',
  TR:'Turkey', PK:'Pakistan', BD:'Bangladesh', TH:'Thailand', VN:'Vietnam',
  ID:'Indonesia', PH:'Philippines', MX:'Mexico', AR:'Argentina', CO:'Colombia',
}

const LEVEL_INFO = [
  { n: 1, label: 'Bronze · Level 1', color: '#CD7F32', bg: 'rgba(205,127,50,0.08)', border: 'rgba(205,127,50,0.3)',
    time: '5–7 days', price: 'From $299',
    items: ['Management identity', 'Legal existence', 'Declared address'] },
  { n: 2, label: 'Silver · Level 2', color: '#A8A9AD', bg: 'rgba(168,169,173,0.1)', border: 'rgba(168,169,173,0.4)',
    time: '10–14 days', price: 'From $499', featured: true,
    items: ['Includes Bronze', 'Selected documentary elements', 'Financial & operational elements'] },
  { n: 3, label: 'Gold · Level 3',  color: '#C9A84C', bg: 'rgba(201,168,76,0.08)', border: 'rgba(201,168,76,0.35)',
    time: '14–21 days', price: 'From $899',
    items: ['Includes Silver', 'On-site PAC inspection', 'Detailed field report'] },
]

const DOCS = [
  { icon: '🏢', label: 'Certificate of incorporation / Trade licence' },
  { icon: '🪪', label: 'Director / owner identity documents (passport or ID)' },
  { icon: '📍', label: 'Proof of registered address' },
  { icon: '📊', label: 'Latest financial statements (Level 2+)' },
  { icon: '🔍', label: 'Beneficial ownership declaration (Level 2+)' },
  { icon: '🏭', label: 'Site visit access grant (Level 3 — PAC inspection)' },
]

export default function Onboarding() {
  const { t }    = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [profile, setProfile] = useState({
    name: '', sector: '', country: '', website: '',
  })
  const [chosenLevel, setChosenLevel] = useState(null)

  // Auth guard
  useEffect(() => {
    const user = getSession()
    if (!user) { navigate('/login'); return }
    if (user.role !== 'company') { navigate('/dashboard'); return }
    // Pre-fill name from session
    setProfile(p => ({ ...p, name: user.name || '' }))
    // Fetch existing company profile for pre-fill
    api.get('/api/companies/me').then(res => {
      const c = res.data.company
      if (c) setProfile(p => ({
        name:    c.companyName || c.name || p.name,
        sector:  c.sector  || '',
        country: c.country || '',
        website: c.website || '',
      }))
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const TOTAL_STEPS = 3

  // Step 1 save
  const saveProfile = async () => {
    if (!profile.name.trim()) { setError(t('onboarding.error_name_required')); return }
    setSaving(true); setError('')
    try {
      await api.patch('/api/companies/me', {
        companyName: profile.name.trim(),
        sector:      profile.sector,
        country:     profile.country,
        website:     profile.website.trim(),
      })
      setStep(2)
    } catch {
      setError(t('onboarding.error_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    navigate('/dashboard')
  }

  const G = {
    page:  { minHeight: '100vh', background: '#f7f6f2', color: '#28251d', fontFamily: "'General Sans','Inter',system-ui,sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: 'clamp(1.5rem,4vw,3rem) clamp(1rem,4vw,1.5rem)' },
    card:  { width: '100%', maxWidth: '640px', background: '#f9f8f5', border: '1px solid rgba(40,37,29,0.1)', borderRadius: '18px', padding: 'clamp(1.5rem,4vw,2.5rem)', boxShadow: '0 8px 32px rgba(40,37,29,0.07)' },
    eyebrow: { textTransform:'uppercase', letterSpacing:'0.12em', fontSize:'0.72rem', color:'#9b988f', marginBottom:'0.5rem' },
    h1:    { fontFamily:"'Georgia',serif", fontSize:'clamp(1.35rem,3vw,1.85rem)', fontWeight:'700', lineHeight:'1.1', letterSpacing:'-0.02em', margin:'0 0 0.6rem', color:'#28251d' },
    sub:   { color:'#6e6a63', fontSize:'0.9rem', lineHeight:'1.6', margin:'0 0 1.75rem' },
    label: { display:'block', fontSize:'0.82rem', fontWeight:'600', color:'#6e6a63', marginBottom:'0.35rem', textTransform:'uppercase', letterSpacing:'0.05em' },
    input: { width:'100%', padding:'0.65rem 0.9rem', background:'#f3f0ec', border:'1px solid rgba(40,37,29,0.12)', borderRadius:'8px', fontSize:'0.9rem', color:'#28251d', fontFamily:'inherit', outline:'none', boxSizing:'border-box' },
    select:{ width:'100%', padding:'0.65rem 0.9rem', background:'#f3f0ec', border:'1px solid rgba(40,37,29,0.12)', borderRadius:'8px', fontSize:'0.9rem', color:'#28251d', fontFamily:'inherit', outline:'none', appearance:'none', boxSizing:'border-box' },
    btn:   { display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0.75rem 1.75rem', background:'#01696f', color:'#f9f8f4', border:'none', borderRadius:'999px', fontWeight:'600', fontSize:'0.9rem', cursor:'pointer', fontFamily:'inherit', transition:'background 0.2s' },
    btnSec:{ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0.7rem 1.5rem', background:'transparent', color:'#6e6a63', border:'1px solid rgba(40,37,29,0.12)', borderRadius:'999px', fontWeight:'500', fontSize:'0.9rem', cursor:'pointer', fontFamily:'inherit' },
    row:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' },
    err:   { background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.3)', borderRadius:'8px', padding:'0.65rem 1rem', fontSize:'0.85rem', color:'#c0392b', marginBottom:'1rem' },
    notice:{ background:'rgba(1,105,111,0.06)', border:'1px solid rgba(1,105,111,0.15)', borderRadius:'10px', padding:'1rem 1.2rem', fontSize:'0.875rem', color:'#6e6a63', lineHeight:'1.6' },
  }

  const ProgressBar = () => (
    <div style={{ marginBottom:'1.75rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.5rem' }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.4rem', flex: i < TOTAL_STEPS - 1 ? 1 : undefined }}>
            <div style={{ width:'24px', height:'24px', borderRadius:'50%', background: i + 1 <= step ? '#01696f' : 'rgba(40,37,29,0.1)', color: i + 1 <= step ? '#f9f8f4' : '#9b988f', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.72rem', fontWeight:'700', flexShrink:0 }}>
              {i + 1 < step ? '✓' : i + 1}
            </div>
            {i < TOTAL_STEPS - 1 && (
              <div style={{ flex:1, height:'2px', background: i + 1 < step ? '#01696f' : 'rgba(40,37,29,0.1)', borderRadius:'1px' }}/>
            )}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'#9b988f' }}>
        <span>{t('onboarding.profile_label')}</span>
        <span style={{ textAlign:'center' }}>{t('onboarding.documents_label')}</span>
        <span style={{ textAlign:'right' }}>{t('onboarding.level_label')}</span>
      </div>
    </div>
  )

  return (
    <div style={G.page}>

      {/* Logo */}
      <Link to="/" style={{ display:'flex', alignItems:'center', gap:'0.6rem', textDecoration:'none', color:'#28251d', marginBottom:'2rem', alignSelf:'flex-start', maxWidth:'640px', width:'100%' }}>
        <svg width={28} height={28} viewBox="0 0 64 64" fill="none">
          <rect x="6" y="10" width="22" height="44" rx="8" stroke="#01696f" strokeWidth="4"/>
          <path d="M17 22L17 42" stroke="#01696f" strokeWidth="4" strokeLinecap="round"/>
          <path d="M36 18H44C52.837 18 60 25.163 60 34C60 42.837 52.837 50 44 50H36V18Z" stroke="#01696f" strokeWidth="4"/>
          <path d="M42 24H44C49.523 24 54 28.477 54 34C54 39.523 49.523 44 44 44H42" stroke="#01696f" strokeWidth="4" strokeLinecap="round"/>
        </svg>
        <strong style={{ fontSize:'1rem', color:'#28251d' }}>MyDD</strong>
        <span style={{ fontSize:'0.78rem', color:'#9b988f', marginLeft:'0.2rem' }}>B&amp;E Consult FZCO</span>
      </Link>

      <div style={G.card}>
        <ProgressBar />

        {/* ── Step 1: Profile ── */}
        {step === 1 && (
          <>
            <div style={G.eyebrow}>{t('onboarding.step1_eyebrow')}</div>
            <h1 style={G.h1}>{t('onboarding.step1_heading')}</h1>
            <p style={G.sub}>{t('onboarding.step1_sub')}</p>

            {error && <div style={G.err}>{error}</div>}

            <div style={{ display:'flex', flexDirection:'column', gap:'1rem', marginBottom:'1.5rem' }}>
              <div>
                <label style={G.label} htmlFor="ob-name">{t('onboarding.label_name')}</label>
                <input id="ob-name" style={G.input} value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  placeholder={t('onboarding.placeholder_name')} />
              </div>

              <div style={G.row}>
                <div>
                  <label style={G.label} htmlFor="ob-sector">{t('onboarding.label_sector')}</label>
                  <select id="ob-sector" style={G.select} value={profile.sector}
                    onChange={e => setProfile(p => ({ ...p, sector: e.target.value }))}>
                    <option value="">{t('onboarding.placeholder_sector')}</option>
                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={G.label} htmlFor="ob-country">{t('onboarding.label_country')}</label>
                  <select id="ob-country" style={G.select} value={profile.country}
                    onChange={e => setProfile(p => ({ ...p, country: e.target.value }))}>
                    <option value="">{t('onboarding.placeholder_country')}</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{COUNTRY_NAMES[c] || c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={G.label} htmlFor="ob-website">{t('onboarding.label_website')}</label>
                <input id="ob-website" style={G.input} value={profile.website}
                  onChange={e => setProfile(p => ({ ...p, website: e.target.value }))}
                  placeholder={t('onboarding.placeholder_website')} type="url" />
              </div>
            </div>

            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
              <button style={G.btnSec} onClick={finish}>{t('onboarding.skip')}</button>
              <button style={G.btn} onClick={saveProfile} disabled={saving}>
                {saving ? t('onboarding.saving') : t('onboarding.continue')}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Documents ── */}
        {step === 2 && (
          <>
            <div style={G.eyebrow}>{t('onboarding.step2_eyebrow')}</div>
            <h1 style={G.h1}>{t('onboarding.step2_heading')}</h1>
            <p style={G.sub}>{t('onboarding.step2_sub')}</p>

            <ul style={{ listStyle:'none', margin:'0 0 1.5rem', padding:0, display:'flex', flexDirection:'column', gap:'0.6rem' }}>
              {DOCS.map((doc, i) => (
                <li key={i} style={{ display:'flex', gap:'0.85rem', alignItems:'flex-start', padding:'0.8rem 1rem', background:'#f3f0ec', borderRadius:'10px' }}>
                  <span style={{ fontSize:'1.2rem', flexShrink:0 }}>{doc.icon}</span>
                  <span style={{ fontSize:'0.875rem', color:'#6e6a63', lineHeight:'1.5' }}>{doc.label}</span>
                </li>
              ))}
            </ul>

            <div style={G.notice}>
              <strong style={{ color:'#28251d', display:'block', marginBottom:'0.35rem' }}>{t('onboarding.docs_upload_title')}</strong>
              {t('onboarding.docs_upload_body')}
            </div>

            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
              <button style={G.btnSec} onClick={() => setStep(1)}>{t('onboarding.back')}</button>
              <button style={G.btn} onClick={() => setStep(3)}>{t('onboarding.continue')}</button>
            </div>
          </>
        )}

        {/* ── Step 3: Level ── */}
        {step === 3 && (
          <>
            <div style={G.eyebrow}>{t('onboarding.step3_eyebrow')}</div>
            <h1 style={G.h1}>{t('onboarding.step3_heading')}</h1>
            <p style={G.sub}>{t('onboarding.step3_sub')}</p>

            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', marginBottom:'1.5rem' }}>
              {LEVEL_INFO.map(lv => (
                <button key={lv.n} onClick={() => setChosenLevel(lv.n)}
                  style={{ width:'100%', textAlign:'left', padding:'1rem 1.15rem', background: chosenLevel === lv.n ? lv.bg : '#f3f0ec', border:`2px solid ${chosenLevel === lv.n ? lv.color : 'transparent'}`, borderRadius:'12px', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'1rem', marginBottom:'0.4rem' }}>
                    <strong style={{ fontSize:'0.9rem', color:'#28251d' }}>{lv.label}</strong>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:'0.8rem', fontWeight:'700', color: lv.color }}>{lv.price}</div>
                      <div style={{ fontSize:'0.72rem', color:'#9b988f' }}>{lv.time}</div>
                    </div>
                  </div>
                  <ul style={{ margin:0, paddingLeft:'1rem', color:'#6e6a63', fontSize:'0.8rem', lineHeight:'1.75' }}>
                    {lv.items.map((it, j) => <li key={j}>{it}</li>)}
                  </ul>
                  {lv.featured && (
                    <div style={{ marginTop:'0.5rem', fontSize:'0.72rem', fontWeight:'700', color: lv.color, textTransform:'uppercase', letterSpacing:'0.08em' }}>{t('onboarding.most_popular')}</div>
                  )}
                </button>
              ))}
            </div>

            <div style={G.notice}>
              <strong style={{ color:'#28251d', display:'block', marginBottom:'0.35rem' }}>{t('onboarding.payment_title')}</strong>
              {t('onboarding.payment_body')}
            </div>

            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1.5rem' }}>
              <button style={G.btnSec} onClick={() => setStep(2)}>{t('onboarding.back')}</button>
              <button style={G.btn} onClick={finish}>
                {chosenLevel
                  ? t('onboarding.finish_with_level', { level: LEVEL_INFO.find(l => l.n === chosenLevel)?.label })
                  : t('onboarding.go_to_dashboard')}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Skip link */}
      <button onClick={finish} style={{ marginTop:'1.25rem', background:'none', border:'none', cursor:'pointer', fontSize:'0.82rem', color:'#9b988f', fontFamily:'inherit' }}>
        {t('onboarding.skip_bottom')}
      </button>

    </div>
  )
}
