import { useState, useCallback } from 'react'

// ── useToast ──────────────────────────────────────────────────────────────────
// Returns [toasts, showToast].
// showToast(message, type?) — type: 'success' | 'error' | 'info'
// Toasts auto-dismiss after 3.5 s.
export function useToast() {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  return [toasts, showToast]
}

// ── ToastContainer ────────────────────────────────────────────────────────────
// Renders toasts fixed at bottom-right. Drop anywhere in the page tree.
const COLORS = {
  success: { bg: '#0e2318', border: 'rgba(46,204,113,0.35)', text: '#2ecc71', icon: '✓' },
  error:   { bg: '#2a1515', border: 'rgba(231,76,60,0.4)',   text: '#ff7f7f', icon: '✗' },
  info:    { bg: '#141d2a', border: 'rgba(201,168,76,0.35)', text: '#C9A84C', icon: 'ℹ' },
}

export function ToastContainer({ toasts }) {
  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '1.75rem',
      right: '1.75rem',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type] || COLORS.success
        return (
          <div
            key={t.id}
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: '600',
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              pointerEvents: 'auto',
              animation: 'toastIn 0.2s ease',
              fontFamily: 'sans-serif',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{c.icon}</span>
            {t.message}
          </div>
        )
      })}

      {/* keyframe injected once */}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
