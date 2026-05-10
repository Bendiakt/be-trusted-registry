import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'mydd_cookie_consent'

/**
 * GDPR/RGPD cookie consent banner.
 * Appears at the bottom of every page until the user accepts or declines.
 * Choice is stored in localStorage — no tracking until accepted.
 *
 * Drop <CookieBanner /> anywhere in the app tree (main.jsx is ideal).
 */
export default function CookieBanner() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Show only if user hasn't made a choice yet
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Small delay so it doesn't flash immediately on first paint
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted')
    setVisible(false)
  }

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        width: 'min(640px, calc(100vw - 2rem))',
        background: '#161616',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
        padding: '1.1rem 1.4rem',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        fontFamily: 'sans-serif',
        animation: 'cookieIn 0.25s ease',
      }}
    >
      <style>{`@keyframes cookieIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>

      {/* Icon */}
      <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>🍪</span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ color: '#ddd', fontSize: '0.82rem', fontWeight: '600', marginBottom: '0.2rem' }}>
          {t('cookie.title')}
        </div>
        <div style={{ color: '#666', fontSize: '0.75rem', lineHeight: 1.5 }}>
          {t('cookie.desc')}{' '}
          <a
            href="/privacy"
            style={{ color: '#C9A84C', textDecoration: 'none', fontWeight: '600' }}
          >
            {t('cookie.learn_more')}
          </a>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
        <button
          onClick={decline}
          style={{
            background: 'transparent',
            color: '#555',
            border: '1px solid #2a2a2a',
            padding: '0.45rem 0.9rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: '600',
            whiteSpace: 'nowrap',
          }}
        >
          {t('cookie.decline')}
        </button>
        <button
          onClick={accept}
          style={{
            background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)',
            color: '#111',
            border: 'none',
            padding: '0.45rem 1.1rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: '700',
            whiteSpace: 'nowrap',
          }}
        >
          {t('cookie.accept')}
        </button>
      </div>
    </div>
  )
}
