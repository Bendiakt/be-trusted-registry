import { Link } from 'react-router-dom'

// ─── Shared prose styles (mirrors Legal.jsx for visual consistency) ──────────
const S = {
  page:   { maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'system-ui,sans-serif', lineHeight: 1.75, color: '#e2e2e2', background: '#111', minHeight: '100vh' },
  h1:     { fontSize: '1.6rem', fontWeight: 700, color: '#C9A84C', marginBottom: '0.25rem' },
  meta:   { fontSize: '0.78rem', color: '#666', marginBottom: '2.5rem' },
  h2:     { fontSize: '1.05rem', fontWeight: 700, color: '#C9A84C', marginTop: '2.5rem', marginBottom: '0.5rem', borderBottom: '1px solid #2a2a2a', paddingBottom: '0.3rem' },
  p:      { marginBottom: '0.85rem', color: '#ccc' },
  ul:     { paddingLeft: '1.4rem', marginBottom: '0.85rem', color: '#ccc' },
  li:     { marginBottom: '0.4rem' },
  table:  { width: '100%', borderCollapse: 'collapse', marginBottom: '1.2rem', fontSize: '0.85rem' },
  th:     { textAlign: 'left', padding: '8px 12px', background: '#1a1a1a', color: '#C9A84C', borderBottom: '1px solid #333' },
  td:     { padding: '7px 12px', borderBottom: '1px solid #222', color: '#bbb', verticalAlign: 'top' },
  strong: { color: '#e2e2e2', fontWeight: 600 },
  sep:    { border: 'none', borderTop: '1px solid #1e1e1e', margin: '2rem 0' },
  link:   { color: '#C9A84C', textDecoration: 'none' },
  footer: { marginTop: 60, paddingTop: 24, borderTop: '1px solid #1e1e1e', color: '#444', fontSize: '0.75rem' },
}

export default function Support() {
  return (
    <div style={S.page}>
      <h1 style={S.h1}>Support &amp; Contact</h1>
      <p style={S.meta}>MyDD Registry — B&amp;E Consult FZCO · Dubai, UAE</p>

      <h2 style={S.h2}>Nous contacter</h2>
      <p style={S.p}>Selon votre demande, écrivez à l'adresse la plus adaptée :</p>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Adresse</th>
            <th style={S.th}>Pour quoi ?</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['support@mydd.work', 'Aide produit : connexion, certification, paiements, missions PAC, bugs.'],
            ['privacy@mydd.work', 'Données personnelles & RGPD (accès, effacement, opposition).'],
            ['legal@mydd.work', 'Questions contractuelles, CGU, signalements juridiques.'],
          ].map(([email, purpose]) => (
            <tr key={email}>
              <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                <a href={`mailto:${email}`} style={S.link}>{email}</a>
              </td>
              <td style={S.td}>{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr style={S.sep} />

      <h2 style={S.h2}>Délais de réponse (SLA)</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Priorité</th>
            <th style={S.th}>Exemple</th>
            <th style={S.th}>1ère réponse</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Critique', 'Service indisponible, paiement bloqué, sécurité', '4 h ouvrées'],
            ['Élevée', 'Fonction majeure dégradée sans contournement', '1 jour ouvré'],
            ['Normale', 'Question, bug mineur avec contournement', '2 jours ouvrés'],
            ['RGPD', 'Exercice de vos droits (accès, effacement…)', 'Accusé sous 3 j · réponse 30 j'],
          ].map(([prio, ex, sla]) => (
            <tr key={prio}>
              <td style={{ ...S.td, color: '#C9A84C', fontWeight: 600 }}>{prio}</td>
              <td style={S.td}>{ex}</td>
              <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{sla}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={S.p}>Heures ouvrées : dimanche–jeudi, 9h–18h (GST, UTC+4).</p>

      <hr style={S.sep} />

      <h2 style={S.h2}>Vos droits RGPD</h2>
      <p style={S.p}>
        Vous pouvez exercer vos droits directement depuis votre compte ou en nous écrivant :
      </p>
      <ul style={S.ul}>
        <li style={S.li}>
          <span style={S.strong}>Accès &amp; portabilité</span> — une fois connecté, demandez
          l'export complet de vos données (format JSON) via l'API
          <code> /api/auth/me/export</code>, ou écrivez à{' '}
          <a href="mailto:privacy@mydd.work" style={S.link}>privacy@mydd.work</a>.
        </li>
        <li style={S.li}>
          <span style={S.strong}>Effacement (« droit à l'oubli »)</span> — la suppression de
          compte anonymise immédiatement vos données personnelles (confirmation par mot de
          passe requise).
        </li>
        <li style={S.li}>
          <span style={S.strong}>Rectification, opposition, limitation</span> — contactez{' '}
          <a href="mailto:privacy@mydd.work" style={S.link}>privacy@mydd.work</a> (réponse sous 30 jours).
        </li>
      </ul>
      <p style={S.p}>
        Détails complets dans notre{' '}
        <Link to="/privacy" style={S.link}>Politique de confidentialité</Link>.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>Documents utiles</h2>
      <ul style={S.ul}>
        <li style={S.li}><Link to="/terms" style={S.link}>Conditions Générales d'Utilisation</Link></li>
        <li style={S.li}><Link to="/privacy" style={S.link}>Politique de Confidentialité</Link></li>
        <li style={S.li}><Link to="/registry" style={S.link}>Registre public des entreprises certifiées</Link></li>
      </ul>

      <div style={S.footer}>
        B&amp;E Consult FZCO · Dubai, UAE ·{' '}
        <a href="mailto:support@mydd.work" style={S.link}>support@mydd.work</a>
        {' · '}
        <Link to="/" style={S.link}>← Accueil</Link>
      </div>
    </div>
  )
}
