import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * OfflineBanner
 * Listens for `app:offline` / `app:online` events dispatched by the Axios
 * interceptor in lib/api.js and also the native browser online/offline events.
 * Shows a sticky top bar while network is unavailable.
 */
export default function OfflineBanner() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline  = () => setOffline(false)

    window.addEventListener('app:offline', goOffline)
    window.addEventListener('app:online',  goOnline)
    window.addEventListener('offline',     goOffline)
    window.addEventListener('online',      goOnline)

    return () => {
      window.removeEventListener('app:offline', goOffline)
      window.removeEventListener('app:online',  goOnline)
      window.removeEventListener('offline',     goOffline)
      window.removeEventListener('online',      goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position:   'fixed',
        top:        0,
        left:       0,
        right:      0,
        zIndex:     9999,
        background: '#7c3a00',
        color:      '#ffcfa0',
        padding:    '0.6rem 1.25rem',
        fontSize:   '0.85rem',
        fontWeight: '600',
        textAlign:  'center',
        fontFamily: 'Inter, sans-serif',
        borderBottom: '1px solid #a04e00',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
      }}
    >
      <span>⚠️</span>
      <span>{t('offline.message')}</span>
    </div>
  )
}
