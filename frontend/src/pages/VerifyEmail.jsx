import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'

export default function VerifyEmail() {
  const { t }               = useTranslation()
  const [searchParams]      = useSearchParams()
  const token               = searchParams.get('token')
  const [status, setStatus] = useState('pending') // pending | success | error
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setError(t('verify_email.missing_token')); return }
    api.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setStatus('success'))
      .catch(err => {
        setStatus('error')
        setError(err.response?.data?.error || t('verify_email.invalid_token'))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const G = {
    page: { minHeight: '100vh', background: '#0a0a0a', fontFamily: 'Inter,system-ui,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' },
    card: { background: '#111', border: '1px solid #1f1f1f', borderRadius: '16px', padding: '3rem 2.5rem', maxWidth: '420px', width: '100%', textAlign: 'center' },
    btn:  { display: 'inline-block', background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', color: '#111', fontWeight: '700', padding: '0.75rem 1.75rem', borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem', border: 'none', cursor: 'pointer' },
  }

  return (
    <div style={G.page}>
      <div style={G.card}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem' }}>
          <div style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7B2E)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#111', fontSize: '1.1rem' }}>M</div>
          <div style={{ color: '#fff', fontWeight: '800', fontSize: '1.15rem' }}>MyDD</div>
        </div>

        {status === 'pending' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <div style={{ color: '#aaa', fontSize: '0.95rem' }}>{t('verify_email.verifying')}</div>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(46,204,113,0.1)', border: '2px solid #2ecc71', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.5rem' }}>✓</div>
            <h1 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.75rem' }}>{t('verify_email.success_title')}</h1>
            <p style={{ color: '#888', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '2rem' }}>{t('verify_email.success_desc')}</p>
            <Link to="/dashboard" style={G.btn}>{t('verify_email.go_dashboard')}</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(231,76,60,0.1)', border: '2px solid #e74c3c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.5rem' }}>✗</div>
            <h1 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.75rem' }}>{t('verify_email.error_title')}</h1>
            <p style={{ color: '#888', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '2rem' }}>{error || t('verify_email.error_desc')}</p>
            <Link to="/dashboard" style={{ ...G.btn, background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C' }}>{t('verify_email.go_dashboard')}</Link>
          </>
        )}
      </div>
    </div>
  )
}
