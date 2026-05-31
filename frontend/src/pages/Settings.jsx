import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
      showToast('Aucune modification à enregistrer.', 'info')
      return
    }
    setSavingProfile(true)
    try {
      const { data } = await api.patch('/api/auth/profile', payload)
      if (data?.name) saveSession({ ...user, name: data.name })
      setCurrentPassword('')
      setNewPassword('')
      showToast('Profil mis à jour.', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || 'Échec de la mise à jour.', 'error')
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
      showToast('Export téléchargé.', 'success')
    } catch (err) {
      showToast(err.response?.data?.error || 'Export impossible.', 'error')
    } finally {
      setExporting(false)
    }
  }

  // ── Delete account (RGPD Art. 17) ─────────────────────────────────────────────
  async function handleDelete() {
    if (!deletePassword) {
      showToast('Mot de passe requis pour confirmer.', 'error')
      return
    }
    setDeleting(true)
    try {
      await api.delete('/api/auth/me', { data: { password: deletePassword } })
      clearSession()
      // Hard redirect home — session is gone.
      window.location.assign('/')
    } catch (err) {
      showToast(err.response?.data?.error || 'Suppression impossible.', 'error')
      setDeleting(false)
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Paramètres du compte</h1>
      <p style={S.meta}>{user.email} · rôle : {user.role}</p>

      {/* ── Profil ── */}
      <form style={S.card} onSubmit={handleSaveProfile}>
        <h2 style={S.h2}>Profil</h2>
        <p style={S.p}>Mettez à jour votre nom ou votre mot de passe.</p>

        <label style={S.label} htmlFor="set-name">Nom</label>
        <input id="set-name" style={S.input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />

        <label style={S.label} htmlFor="set-cur">Mot de passe actuel <span style={{ color: '#666' }}>(pour changer le mot de passe)</span></label>
        <input id="set-cur" type="password" style={S.input} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />

        <label style={S.label} htmlFor="set-new">Nouveau mot de passe <span style={{ color: '#666' }}>(min. 8 caractères)</span></label>
        <input id="set-new" type="password" style={S.input} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />

        <button type="submit" style={S.btn} disabled={savingProfile}>
          {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      {/* ── Données personnelles (RGPD) ── */}
      <div style={S.card}>
        <h2 style={S.h2}>Vos données (RGPD)</h2>
        <p style={S.p}>
          Téléchargez une copie complète des données que nous détenons sur vous
          (droit d'accès et de portabilité, Art. 15 &amp; 20). Format JSON.
        </p>
        <button type="button" style={S.btnGhost} onClick={handleExport} disabled={exporting}>
          {exporting ? 'Préparation…' : '⬇ Télécharger mes données'}
        </button>
        <p style={{ ...S.p, marginTop: '1rem', marginBottom: 0 }}>
          Questions sur vos données ? <Link to="/support" style={S.link}>Support</Link> ·{' '}
          <Link to="/privacy" style={S.link}>Politique de confidentialité</Link>.
        </p>
      </div>

      {/* ── Zone de danger ── */}
      <div style={S.cardDanger}>
        <h2 style={S.h2Danger}>Supprimer mon compte</h2>
        <p style={S.p}>
          La suppression <strong style={{ color: '#e2e2e2' }}>anonymise immédiatement</strong> vos
          données personnelles (droit à l'effacement, Art. 17). Cette action est
          irréversible. Vos enregistrements de certification sont conservés sous
          forme anonymisée pour l'intégrité du registre.
        </p>
        <button type="button" style={S.btnDanger} onClick={() => setShowDelete(true)}>
          Supprimer mon compte
        </button>
      </div>

      <div style={S.footer}>
        <Link to="/dashboard" style={S.link}>← Retour au tableau de bord</Link>
      </div>

      {/* ── Delete confirmation modal ── */}
      {showDelete && (
        <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Confirmer la suppression du compte">
          <div style={S.modal}>
            <h2 style={S.h2Danger}>Confirmer la suppression</h2>
            <p style={S.p}>
              Saisissez votre mot de passe pour confirmer la suppression définitive
              de votre compte.
            </p>
            <label style={S.label} htmlFor="del-pass">Mot de passe</label>
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
                Annuler
              </button>
              <button type="button" style={S.btnDangerSolid} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
