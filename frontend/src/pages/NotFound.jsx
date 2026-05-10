import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = '404 — Page Not Found | MyDD'
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'Inter,sans-serif', textAlign: 'center' }}>

      {/* Logo */}
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', marginBottom: '3rem' }}>
        <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '1rem' }}>M</div>
        <div style={{ color: '#C9A84C', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.01em' }}>MyDD</div>
      </Link>

      {/* 404 */}
      <div style={{ fontSize: 'clamp(4rem,15vw,9rem)', fontWeight: '900', color: '#1a1a1a', lineHeight: 1, letterSpacing: '-0.04em', marginBottom: '0.5rem', userSelect: 'none' }}>404</div>

      <div style={{ width: '60px', height: '3px', background: 'linear-gradient(90deg,#C9A84C,#9A7B2E)', borderRadius: '2px', margin: '0 auto 1.5rem' }} />

      <h1 style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)', fontWeight: '700', color: '#eee', marginBottom: '0.75rem', letterSpacing: '-0.01em' }}>
        {t('not_found.title')}
      </h1>
      <p style={{ color: '#555', fontSize: '0.95rem', maxWidth: '380px', lineHeight: 1.6, marginBottom: '2.5rem' }}>
        {t('not_found.description')}
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link to="/" style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', textDecoration: 'none', padding: '0.7rem 1.5rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.9rem' }}>
          {t('not_found.go_home')}
        </Link>
        <Link to="/registry" style={{ background: 'transparent', color: '#C9A84C', textDecoration: 'none', padding: '0.65rem 1.4rem', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', border: '1px solid #C9A84C44' }}>
          {t('landing.nav_registry')}
        </Link>
      </div>
    </div>
  )
}
