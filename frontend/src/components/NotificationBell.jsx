import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'

/**
 * NotificationBell
 * Props:
 *   refreshTrigger  – number; increment to force a re-fetch (e.g. on WS event)
 *   dark            – bool; true for dark-background navbars (default true)
 */
export default function NotificationBell({ refreshTrigger = 0, dark = true }) {
  const navigate    = useNavigate()
  const { t }       = useTranslation()
  const [items,   setItems]   = useState([])
  const [unread,  setUnread]  = useState(0)
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const timerRef    = useRef(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetch = useCallback(async () => {
    try {
      const res = await api.get('/api/notifications')
      setItems(res.data.notifications || [])
      setUnread(res.data.unread || 0)
    } catch {
      /* silent — auth failure is handled by api interceptor */
    }
  }, [])

  // Initial fetch + polling every 30 s
  useEffect(() => {
    fetch()
    timerRef.current = setInterval(fetch, 30_000)
    return () => clearInterval(timerRef.current)
  }, [fetch])

  // Re-fetch when parent signals a new WS notification
  useEffect(() => {
    if (refreshTrigger > 0) fetch()
  }, [refreshTrigger, fetch])

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Actions ────────────────────────────────────────────────────────────────
  const markOne = async (id, link) => {
    try {
      await api.patch(`/api/notifications/${id}/read`)
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
      setUnread(prev => Math.max(0, prev - 1))
    } catch { /* best-effort */ }
    if (link) {
      setOpen(false)
      // If link is internal, use navigate; external fallback → window.location
      if (link.startsWith('/')) navigate(link)
      else window.location.href = link
    }
  }

  const markAll = async () => {
    setLoading(true)
    try {
      await api.patch('/api/notifications/read-all')
      setItems(prev => prev.map(n => ({ ...n, read: true })))
      setUnread(0)
    } catch { /* best-effort */ } finally {
      setLoading(false)
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const textColor  = dark ? '#aaa' : '#555'
  const bg         = dark ? '#1a1a1a' : '#fff'
  const border     = dark ? '#2a2a2a' : '#e5e5e5'
  const rowHover   = dark ? '#222'    : '#f8f8f8'

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('notifications.title')}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '0.35rem',
          lineHeight: 1,
          color: textColor,
          fontSize: '1.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#C9A84C' }}
        onMouseLeave={e => { e.currentTarget.style.color = textColor }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: '0', right: '0',
            background: '#e53e3e',
            color: '#fff',
            fontSize: '0.55rem',
            fontWeight: '800',
            lineHeight: 1,
            minWidth: '15px',
            height: '15px',
            borderRadius: '99px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            border: `2px solid ${dark ? '#161616' : '#fff'}`,
            pointerEvents: 'none',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: '320px',
          maxHeight: '420px',
          overflowY: 'auto',
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 9999,
          fontFamily: 'Inter, sans-serif',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderBottom: `1px solid ${border}`,
            position: 'sticky',
            top: 0,
            background: bg,
            zIndex: 1,
          }}>
            <span style={{ fontWeight: '700', fontSize: '0.85rem', color: dark ? '#ddd' : '#333' }}>
              {t('notifications.title')}{unread > 0 && (
                <span style={{ background: '#e53e3e', color: '#fff', borderRadius: '99px', padding: '0.05rem 0.45rem', fontSize: '0.65rem', marginLeft: '0.3rem' }}>
                  {unread}
                </span>
              )}
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#C9A84C',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  opacity: loading ? 0.5 : 1,
                  padding: 0,
                }}
              >
                {t('notifications.mark_all_read')}
              </button>
            )}
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>
              {t('notifications.empty')}
            </div>
          ) : (
            items.map(n => (
              <NotifRow
                key={n.id}
                n={n}
                dark={dark}
                rowHover={rowHover}
                border={border}
                onRead={markOne}
                t={t}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Single notification row ────────────────────────────────────────────────────
function NotifRow({ n, dark, rowHover, border, onRead, t }) {
  const [hovered, setHovered] = useState(false)

  const ICON = {
    cert_granted:      '🏅',
    mission_assigned:  '📋',
    mission_completed: '✅',
    doc_reviewed:      '📄',
    info:              'ℹ️',
  }

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60_000)
    if (m < 1)  return t('notifications.just_now')
    if (m < 60) return t('notifications.minutes_ago', { n: m })
    const h = Math.floor(m / 60)
    if (h < 24) return t('notifications.hours_ago', { n: h })
    return t('notifications.days_ago', { n: Math.floor(h / 24) })
  }

  return (
    <div
      onClick={() => onRead(n.id, n.link)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        cursor: n.link ? 'pointer' : 'default',
        background: hovered ? rowHover : 'transparent',
        borderBottom: `1px solid ${border}`,
        transition: 'background 0.1s',
        opacity: n.read ? 0.55 : 1,
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: '1.05rem', flexShrink: 0, paddingTop: '1px' }}>
        {ICON[n.type] || ICON.info}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: dark ? (n.read ? '#777' : '#ddd') : (n.read ? '#999' : '#222'),
          fontSize: '0.8rem',
          fontWeight: n.read ? '400' : '600',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginBottom: '0.15rem',
        }}>
          {n.title}
        </div>
        {n.body && (
          <div style={{
            color: dark ? '#555' : '#888',
            fontSize: '0.72rem',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {n.body}
          </div>
        )}
        <div style={{ color: '#444', fontSize: '0.65rem', marginTop: '0.25rem' }}>
          {timeAgo(n.createdAt)}
        </div>
      </div>

      {/* Unread dot */}
      {!n.read && (
        <div style={{
          width: '7px', height: '7px',
          borderRadius: '50%',
          background: '#C9A84C',
          flexShrink: 0,
          marginTop: '5px',
        }} />
      )}
    </div>
  )
}
