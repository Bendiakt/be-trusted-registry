import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Landing() {
  const { t } = useTranslation()
  const [certifiedCount, setCertifiedCount] = useState(null)

  useEffect(() => {
    fetch('/api/registry?limit=1')
      .then(r => r.json())
      .then(d => { if (typeof d?.pagination?.total === 'number') setCertifiedCount(d.pagination.total) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const BASE = 'https://mydd.work'
    document.title = 'MyDD — Trusted Supplier Certification'
    const meta = [
      { name: 'description',        content: 'MyDD is the trusted supplier certification platform for global trade. Verify suppliers instantly with Level 1-3 due-diligence certifications.' },
      { property: 'og:type',        content: 'website' },
      { property: 'og:url',         content: BASE },
      { property: 'og:title',       content: 'MyDD — Certified Supplier Registry' },
      { property: 'og:description', content: 'The trusted certification registry for global supply chains. 3 certification levels, 6 languages, instant verification.' },
      { property: 'og:image',       content: `${BASE}/og-image.svg` },
      { name: 'twitter:card',       content: 'summary_large_image' },
      { name: 'twitter:title',      content: 'MyDD — Certified Supplier Registry' },
      { name: 'twitter:description',content: 'Verify suppliers instantly. MyDD certified registry for global trade.' },
      { name: 'twitter:image',      content: `${BASE}/og-image.svg` },
    ]
    const added = meta.map(attrs => {
      const existing = document.querySelector(attrs.property ? `meta[property="${attrs.property}"]` : `meta[name="${attrs.name}"]`)
      const el = existing || document.createElement('meta')
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      if (!existing) document.head.appendChild(el)
      return el
    })
    return () => { added.forEach(el => { if (!document.querySelector(`meta[property="${el.getAttribute('property')}"][data-static]`)) el.remove() }) }
  }, [])

  const G = {
    page: { minHeight: '100vh', background: '#0a0a0a', fontFamily: 'Inter,sans-serif', color: '#eee' },
    nav:  { background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1f1f1f', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px', position: 'sticky', top: 0, zIndex: 100 },
    btn:  { background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', padding: '0.65rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'none', display: 'inline-block' },
    ghost:{ background: 'transparent', color: '#C9A84C', padding: '0.6rem 1.4rem', borderRadius: '8px', border: '1px solid #C9A84C44', fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-block' },
  }

  const FEATURES = [
    { icon: '🔍', title: t('landing.features.level1_title'), desc: t('landing.features.level1_desc') },
    { icon: '🪪', title: t('landing.features.level2_title'), desc: t('landing.features.level2_desc') },
    { icon: '🏭', title: t('landing.features.level3_title'), desc: t('landing.features.level3_desc') },
    { icon: '🌍', title: t('landing.features.global_title'), desc: t('landing.features.global_desc') },
    { icon: '⚡', title: t('landing.features.realtime_title'), desc: t('landing.features.realtime_desc') },
    { icon: '🔒', title: t('landing.features.secure_title'), desc: t('landing.features.secure_desc') },
  ]

  const STEPS = [
    { n: '01', title: t('landing.how.step1_title'), desc: t('landing.how.step1_desc') },
    { n: '02', title: t('landing.how.step2_title'), desc: t('landing.how.step2_desc') },
    { n: '03', title: t('landing.how.step3_title'), desc: t('landing.how.step3_desc') },
    { n: '04', title: t('landing.how.step4_title'), desc: t('landing.how.step4_desc') },
  ]

  const PLANS = [
    { name: 'Bronze', price: '$490', level: 1, color: '#CD7F32', features: [t('landing.plans.bronze_f1'), t('landing.plans.bronze_f2'), t('landing.plans.bronze_f3')] },
    { name: 'Silver', price: '$990', level: 2, color: '#C0C0C0', features: [t('landing.plans.silver_f1'), t('landing.plans.silver_f2'), t('landing.plans.silver_f3'), t('landing.plans.silver_f4')], popular: true },
    { name: 'Gold',   price: '$2,490', level: 3, color: '#C9A84C', features: [t('landing.plans.gold_f1'), t('landing.plans.gold_f2'), t('landing.plans.gold_f3'), t('landing.plans.gold_f4'), t('landing.plans.gold_f5')] },
  ]

  return (
    <div style={G.page}>
      {/* Nav */}
      <nav style={G.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '1rem' }}>M</div>
          <div>
            <div style={{ color: '#fff', fontWeight: '800', fontSize: '1.1rem' }}>MyDD</div>
            <div style={{ color: '#444', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>My Due Diligence</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <LanguageSwitcher />
          <Link to="/registry" style={{ ...G.ghost, fontSize: '0.8rem', padding: '0.5rem 1.1rem' }}>{t('landing.nav_registry')}</Link>
          <Link to="/login" style={G.ghost}>{t('nav.login')}</Link>
          <Link to="/register" style={G.btn}>{t('landing.cta_start')}</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: '6rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '20px', padding: '0.35rem 1rem', marginBottom: '2rem' }}>
          <span style={{ color: '#C9A84C', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('landing.hero.badge')}</span>
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: '900', lineHeight: 1.1, marginBottom: '1.5rem', color: '#fff', letterSpacing: '-0.02em' }}>
          {t('landing.hero.title_1')}{' '}
          <span style={{ background: 'linear-gradient(135deg,#C9A84C,#E8C96D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t('landing.hero.title_highlight')}
          </span>
          <br />{t('landing.hero.title_2')}
        </h1>
        <p style={{ fontSize: '1.1rem', color: '#888', lineHeight: 1.6, maxWidth: '620px', margin: '0 auto 2.5rem' }}>
          {t('landing.hero.subtitle')}
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" style={{ ...G.btn, fontSize: '1rem', padding: '0.85rem 2rem' }}>{t('landing.cta_start')}</Link>
          <Link to="/registry" style={{ ...G.ghost, fontSize: '1rem', padding: '0.8rem 2rem' }}>{t('landing.cta_registry')}</Link>
          <Link to="/login" style={{ color: '#555', fontSize: '0.9rem', padding: '0.8rem 1rem', textDecoration: 'none' }}>{t('landing.cta_login')}</Link>
        </div>
        <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
          {[
            { n: certifiedCount !== null ? String(certifiedCount) : '…', label: t('landing.stats.certified_companies') },
            { n: '6', label: t('landing.stats.languages') },
            { n: '24h', label: t('landing.stats.verification') },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '900', color: '#C9A84C' }}>{s.n}</div>
              <div style={{ color: '#555', fontSize: '0.8rem', marginTop: '0.2rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.75rem', color: '#fff' }}>{t('landing.features.title')}</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '3rem', fontSize: '0.95rem' }}>{t('landing.features.subtitle')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1.25rem' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#141414', border: '1px solid #1f1f1f', borderRadius: '12px', padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,#C9A84C22,#C9A84C,#C9A84C22)' }} />
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <div style={{ color: '#fff', fontWeight: '700', marginBottom: '0.5rem', fontSize: '0.95rem' }}>{f.title}</div>
              <div style={{ color: '#555', fontSize: '0.85rem', lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: '4rem 2rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.75rem', color: '#fff' }}>{t('landing.how.title')}</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '3rem', fontSize: '0.95rem' }}>{t('landing.how.subtitle')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', background: '#141414', border: '1px solid #1f1f1f', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ flexShrink: 0, width: '48px', height: '48px', borderRadius: '50%', background: i === 3 ? 'linear-gradient(135deg,#C9A84C,#9A7B2E)' : '#1a1a1a', border: i === 3 ? 'none' : '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '0.8rem', color: i === 3 ? '#111' : '#444' }}>
                {s.n}
              </div>
              <div>
                <div style={{ color: '#fff', fontWeight: '700', marginBottom: '0.35rem' }}>{s.title}</div>
                <div style={{ color: '#555', fontSize: '0.875rem', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.75rem', color: '#fff' }}>{t('landing.plans.title')}</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '3rem', fontSize: '0.95rem' }}>{t('landing.plans.subtitle')}</p>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {PLANS.map(p => (
            <div key={p.name} style={{ background: '#141414', border: p.popular ? `1px solid ${p.color}` : '1px solid #1f1f1f', borderRadius: '16px', padding: '2rem', flex: '1', minWidth: '240px', maxWidth: '320px', position: 'relative', overflow: 'hidden', boxShadow: p.popular ? `0 0 40px ${p.color}22` : 'none' }}>
              {p.popular && <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: `${p.color}22`, color: p.color, fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.1em', padding: '0.25rem 0.6rem', borderRadius: '10px', border: `1px solid ${p.color}44` }}>★ {t('landing.plans.popular')}</div>}
              <div style={{ color: p.color, fontWeight: '800', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{p.name}</div>
              <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', marginBottom: '0.25rem' }}>{p.price}</div>
              <div style={{ color: '#555', fontSize: '0.8rem', marginBottom: '1.5rem' }}>{t('landing.plans.per_year')}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {p.features.map(f => (
                  <li key={f} style={{ color: '#888', fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: p.color, flexShrink: 0, marginTop: '0.1rem' }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link to="/register" style={{ ...G.btn, width: '100%', textAlign: 'center', boxSizing: 'border-box', background: p.popular ? `linear-gradient(135deg,${p.color},#9A7B2E)` : 'transparent', color: p.popular ? '#111' : p.color, border: p.popular ? 'none' : `1px solid ${p.color}44` }}>
                {t('landing.cta_start')}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section style={{ maxWidth: '900px', margin: '2rem auto 4rem', padding: '0 2rem' }}>
        <div style={{ background: 'linear-gradient(135deg,rgba(201,168,76,0.12),rgba(154,123,46,0.06))', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '16px', padding: '3rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#fff', marginBottom: '1rem' }}>{t('landing.cta_banner.title')}</h2>
          <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.95rem', lineHeight: 1.6 }}>{t('landing.cta_banner.subtitle')}</p>
          <Link to="/register" style={{ ...G.btn, fontSize: '1rem', padding: '0.9rem 2.5rem' }}>{t('landing.cta_start')}</Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem', textAlign: 'center' }}>
        <div style={{ color: '#333', fontSize: '0.8rem' }}>
          © {new Date().getFullYear()} B&amp;E Consult FZCO · Dubai Silicon Oasis, UAE ·{' '}
          <Link to="/login" style={{ color: '#444', textDecoration: 'none' }}>Sign in</Link>
          {' · '}
          <Link to="/register" style={{ color: '#444', textDecoration: 'none' }}>Register</Link>
        </div>
      </footer>
    </div>
  )
}
