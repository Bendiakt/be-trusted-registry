import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '../i18n'

export default function LanguageSwitcher({ style = {} }) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0]

  const changeLanguage = (code) => {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: 'transparent',
          border: '1px solid #2e2e2e',
          borderRadius: '6px',
          padding: '0.35rem 0.75rem',
          color: '#888',
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontFamily: 'inherit',
          transition: 'border-color 0.2s',
        }}
        aria-label="Select language"
      >
        <span style={{ fontSize: '1rem' }}>{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
        <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          background: '#1a1a1a',
          border: '1px solid #2e2e2e',
          borderRadius: '8px',
          overflow: 'hidden',
          zIndex: 999,
          minWidth: '160px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.6rem 1rem',
                background: lang.code === i18n.language ? 'rgba(201,168,76,0.1)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #222',
                color: lang.code === i18n.language ? '#C9A84C' : '#aaa',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{lang.flag}</span>
              <span>{lang.label}</span>
              {lang.code === i18n.language && (
                <span style={{ marginLeft: 'auto', color: '#C9A84C', fontSize: '0.7rem' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
