import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import { getSession, saveSession, clearSession } from '../lib/session'
import { useToast, ToastContainer } from '../components/Toast'

// ─── Styles (dark theme, consistent with Legal/Support) ──────────────────────
const S = {
  page:    { maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'system-ui,sans-serif', color: '#e2e2e2', background: '#111', minHeight: '100vh' },
  h1:      { fontSize: '1.6rem', fontWeight: 700, color: '#C9A84C', marginBottom: '0.25rem' },
  meta:    { fontSize: '0.78rem', color: '#666', marginBottom: '2.5rem' },
  card:    { background: '#171717', border: '1px solid #262626', borderRadius: 10, padding: '1.5rem', marginBottom: '1.5rem' },
  cardDanger: { background: '#1a1212', border: '1px solid #43201f', borderRadius: 10, padding: '1.5rem', marginBottom: '1.5rem' },
  h2:      { fontSize: '1.02rem', fontWeight: 700, color: '#C9A84C', marginTop: 0, marginBottom: '0.4rem' },
  h2Danger:{ fontSize: '1.02rem', fontWeight: 700, color: '#ff7f7f', marginTop: 0, marginBottom: '0.4rem' },
  p:       { color: '#bbb', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 0, marginBottom: '1rem' },
  label:   { display: 'block', fontSize: '0.8rem', color: '#999', marginBottom: '0.3rem', marginTop: '0.8rem' },
  input:   { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', background: '#0e0e0e', border: '1px solid #333', borderRadius: 6, color: '#e2e2e2', fontSize: '0.9rem' },
  btn:     { padding: '0.6rem 1.1rem', background: '#C9A84C', color: '#111', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', marginTop: '1rem' },
  btnGhost:{ padding: '0.6rem 1.1rem', background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C', borderRadius: 6, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' },
  btnDanger:{ padding: '0.6rem 1.1rem', background: 'transparent', color: '#ff7f7f', border: '1px solid #a33', borderRadius: 6, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' },
  btnDangerSolid:{ padding: '0.6rem 1.1rem', background: '#a33', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' },
  row:     { fontSize: '0.9rem', color: '#ccc', marginBottom: '0.3rem' },
  link:    { color: '#C9A84C', textDecoration: 'none' },
  footer:  { marginTop: 40, fontSize: '0.75rem', color: '#444' },
  // modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:   { background: '#181818', border: '1px solid #43201f', borderRadius: 10, padding: '1.75rem', maxWidth: 440, width: '100%' },
}

export default function Settings() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const user = getSession()
  const [toasts, showToast] = useToast()

  // Profile form
  const [name, setName] = useState(user?.name || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Export
  const [exporting, setExporting] = useState(false)

  // Delete
  const [showDelete, setShowDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (!user) {
    navigate('/login', { replace: true })
    return null
  }

  // ── Save profile ────────────────────────────────────────────────────────────
  async function handleSaveProfile(e) {
    e.preventDefault()
    const payload = {}
    if (name.trim() && name.trim() !== user.name) payload.name = name.trim()
    if (newPassword) {
      payload.newPassword = newPassword
      payload.currentPassword = currentPassword
    }
    if (Object.keys(payload).length === 0) {
      showToast(t('settings.no_changes'), 'info')
      return
    }
    setSavingProfile(true)
    try {
      const { data } = await api.patch('/api/auth/profile', payload)
      if (data?.name) saveSession({ ...user, name: data.name })
      setCurrentPassword('')
      setNewPassword('')
      showToast(t('settings.profile_updated'), 'success')
    } catch (err) {
      showToast(err.response?.data?.error || t('settings.profile_update_failed'), 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Export personal data (RGPD Art. 15/20) ───────────────────────────────────
  async function handleExport() {
    setExporting(true)
    try {
      const res = await api.get('/api/auth/me/export', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `mydd-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast(t('settings.export_downloaded'), 'success')
    } catch (err) {
      showToast(err.response?.data?.error || t('settings.export_failed'), 'error')
    } finally {
      setExporting(false)
    }
  }

  // ── Delete account (RGPD Art. 17) ─────────────────────────────────────────────
  async function handleDelete() {
    if (!deletePassword) {
      showToast(t('settings.password_required'), 'error')
      return
    }
    setDeleting(true)
    try {
      await api.delete('/api/auth/me', { data: { password: deletePassword } })
      clearSession()
      // Hard redirect home — session is gone.
      window.location.assign('/')
    } catch (err) {
      showToast(err.response?.data?.error || t('settings.delete_failed'), 'error')
      setDeleting(false)
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>{t('settings.title')}</h1>
      <p style={S.meta}>{user.email} · {t('settings.account_role')} : {user.role}</p>

      {/* ── Profil ── */}
      <form style={S.card} onSubmit={handleSaveProfile}>
        <h2 style={S.h2}>{t('settings.profile')}</h2>
        <p style={S.p}>{t('settings.profile_desc')}</p>

        <label style={S.label} htmlFor="set-name">{t('settings.name')}</label>
        <input id="set-name" style={S.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />

        <label style={S.label} htmlFor="set-cur">{t('settings.current_password')} <span style={{ color: '#666' }}>{t('settings.current_password_hint')}</span></label>
        <input id="set-cur" type="password" style={S.input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />

        <label style={S.label} htmlFor="set-new">{t('settings.new_password')} <span style={{ color: '#666' }}>{t('settings.new_password_hint')}</span></label>
        <input id="set-new" type="password" style={S.input} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />

        <button type="submit" style={S.btn} disabled={savingProfile}>
          {savingProfile ? t('settings.saving') : t('settings.save')}
        </button>
      </form>

      {/* ── Données personnelles (RGPD) ── */}
      <div style={S.card}>
        <h2 style={S.h2}>{t('settings.data_heading')}</h2>
        <p style={S.p}>{t('settings.data_desc')}</p>
        <button type="button" style={S.btnGhost} onClick={handleExport} disabled={exporting}>
          {exporting ? t('settings.preparing') : `⬇ ${t('settings.download_data')}`}
        </button>
        <p style={{ ...S.p, marginTop: '1rem', marginBottom: 0 }}>
          {t('settings.data_questions')} <Link to="/support" style={S.link}>{t('settings.support')}</Link> ·{' '}
          <Link to="/privacy" style={S.link}>{t('settings.privacy_policy')}</Link>.
        </p>
      </div>

      {/* ── Zone de danger ── */}
      <div style={S.cardDanger}>
        <h2 style={S.h2Danger}>{t('settings.delete_heading')}</h2>
        <p style={S.p}>{t('settings.delete_desc')}</p>
        <button type="button" style={S.btnDanger} onClick={() => setShowDelete(true)}>
          {t('settings.delete_button')}
        </button>
      </div>

      <div style={S.footer}>
        <Link to="/dashboard" style={S.link}>← {t('settings.back_dashboard')}</Link>
      </div>

      {/* ── Delete confirmation modal ── */}
      {showDelete && (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-label={t('settings.confirm_delete')}>
          <div style={S.modal}>
            <h2 style={S.h2Danger}>{t('settings.confirm_delete')}</h2>
            <p style={S.p}>{t('settings.confirm_delete_desc')}</p>
            <label style={S.label} htmlFor="del-pass">{t('settings.password')}</label>
            <input
              id="del-pass" type="password" style={S.input}
              value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button
                type="button" style={S.btnGhost}
                onClick={() => { setShowDelete(false); setDeletePassword('') }}
                disabled={deleting}
              >
                {t('settings.cancel')}
              </button>
              <button type="button" style={S.btnDangerSolid} onClick={handleDelete} disabled={deleting}>
                {deleting ? t('settings.deleting') : t('settings.delete_permanently')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
