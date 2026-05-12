import { useTranslation } from 'react-i18next'
import { useSearchParams, Link } from 'react-router-dom'

// ─── Shared prose styles ─────────────────────────────────────────────────────
const S = {
  page:    { maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'system-ui,sans-serif', lineHeight: 1.75, color: '#e2e2e2', background: '#111' },
  h1:      { fontSize: '1.6rem', fontWeight: 700, color: '#C9A84C', marginBottom: '0.25rem' },
  meta:    { fontSize: '0.78rem', color: '#666', marginBottom: '2.5rem' },
  h2:      { fontSize: '1.05rem', fontWeight: 700, color: '#C9A84C', marginTop: '2.5rem', marginBottom: '0.5rem', borderBottom: '1px solid #2a2a2a', paddingBottom: '0.3rem' },
  p:       { marginBottom: '0.85rem', color: '#ccc' },
  ul:      { paddingLeft: '1.4rem', marginBottom: '0.85rem', color: '#ccc' },
  li:      { marginBottom: '0.3rem' },
  table:   { width: '100%', borderCollapse: 'collapse', marginBottom: '1.2rem', fontSize: '0.85rem' },
  th:      { textAlign: 'left', padding: '8px 12px', background: '#1a1a1a', color: '#C9A84C', borderBottom: '1px solid #333' },
  td:      { padding: '7px 12px', borderBottom: '1px solid #222', color: '#bbb', verticalAlign: 'top' },
  strong:  { color: '#e2e2e2', fontWeight: 600 },
  sep:     { border: 'none', borderTop: '1px solid #1e1e1e', margin: '2rem 0' },
  tabBar:  { display: 'flex', gap: 0, marginBottom: '2.5rem', borderBottom: '2px solid #222' },
  tabBtn:  (active) => ({
    padding: '10px 24px',
    fontWeight: 600,
    fontSize: '0.9rem',
    textDecoration: 'none',
    borderBottom: active ? '2px solid #C9A84C' : '2px solid transparent',
    color: active ? '#C9A84C' : '#666',
    marginBottom: -2,
    transition: 'color 0.15s',
  }),
  footer:  { marginTop: 60, paddingTop: 24, borderTop: '1px solid #1e1e1e', color: '#444', fontSize: '0.75rem' },
  link:    { color: '#C9A84C', textDecoration: 'none' },
}

// ─── CGU content ─────────────────────────────────────────────────────────────
function CGUContent() {
  return (
    <>
      <h1 style={S.h1}>Conditions Générales d'Utilisation</h1>
      <p style={S.meta}>MyDD Registry — B&amp;E Consult FZCO · Dernière mise à jour : 21 avril 2026</p>

      <h2 style={S.h2}>1. Présentation du service</h2>
      <p style={S.p}>
        MyDD Registry (« le Service ») est une plateforme de due diligence et de certification d'entreprises éditée par
        B&amp;E Consult FZCO, société enregistrée aux Émirats Arabes Unis (Dubai, DIFC), ci-après « B&amp;E Consult » ou
        « l'Éditeur ».
      </p>
      <p style={S.p}>
        Le Service permet aux entreprises d'obtenir une certification de confiance (niveaux L1 à L3), de soumettre des
        documents de conformité, et d'accéder au registre public des entités certifiées.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>2. Acceptation des CGU</h2>
      <p style={S.p}>
        L'accès et l'utilisation du Service impliquent l'acceptation pleine et entière des présentes CGU. Toute personne
        qui n'accepte pas ces conditions doit s'abstenir d'utiliser le Service.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>3. Accès au Service</h2>
      <p style={S.p}>
        Le Service est accessible à toute personne morale (entreprise, organisation) disposant d'une adresse email
        professionnelle valide. L'inscription est soumise à vérification d'email.
      </p>
      <p style={S.p}>
        B&amp;E Consult se réserve le droit de suspendre ou de résilier tout compte en cas de violation des présentes
        CGU, sans préavis ni indemnité.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>4. Comptes utilisateurs</h2>
      <p style={S.p}>L'utilisateur s'engage à :</p>
      <ul style={S.ul}>
        <li style={S.li}>Fournir des informations exactes, complètes et à jour lors de l'inscription</li>
        <li style={S.li}>Maintenir la confidentialité de ses identifiants</li>
        <li style={S.li}>Notifier immédiatement B&amp;E Consult de toute utilisation non autorisée de son compte</li>
        <li style={S.li}>Ne pas créer plusieurs comptes pour une même entité</li>
      </ul>
      <p style={S.p}>
        B&amp;E Consult ne saurait être tenu responsable de toute perte résultant d'une utilisation non autorisée du
        compte de l'utilisateur.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>5. Certifications et niveaux de confiance</h2>
      <p style={S.p}>
        Les certifications délivrées par MyDD Registry (niveaux L1, L2, L3) sont basées sur les informations et
        documents fournis par l'entreprise certifiée. Elles constituent une attestation de conformité documentaire à la
        date de délivrance et ne sauraient constituer une garantie absolue de la fiabilité commerciale de l'entité
        certifiée.
      </p>
      <p style={S.p}>B&amp;E Consult se réserve le droit de révoquer toute certification en cas de :</p>
      <ul style={S.ul}>
        <li style={S.li}>Informations erronées ou frauduleuses</li>
        <li style={S.li}>Non-renouvellement dans les délais impartis</li>
        <li style={S.li}>Décision judiciaire ou administrative</li>
      </ul>

      <hr style={S.sep} />

      <h2 style={S.h2}>6. Missions PAC (Post-Award Compliance)</h2>
      <p style={S.p}>
        Les missions d'inspection terrain sont effectuées par des agents PAC indépendants référencés sur la plateforme.
        B&amp;E Consult agit en qualité d'intermédiaire et ne saurait être tenu responsable des conclusions des rapports
        d'inspection, ni des conséquences commerciales qui en découlent.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>7. Tarification et paiements</h2>
      <p style={S.p}>
        Les tarifs des certifications sont affichés sur le Service en USD. Les paiements sont traités par Stripe Inc.
        (États-Unis). B&amp;E Consult ne stocke aucune donnée de carte bancaire.
      </p>
      <p style={S.p}>
        Toute certification achetée est non remboursable une fois le processus de vérification engagé, sauf en cas de
        défaillance technique imputable à B&amp;E Consult.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>8. Propriété intellectuelle</h2>
      <p style={S.p}>
        L'ensemble des éléments du Service (marque MyDD Registry, logo, interface, algorithmes de calcul du Trust Score)
        sont la propriété exclusive de B&amp;E Consult FZCO. Toute reproduction sans autorisation écrite est interdite.
      </p>
      <p style={S.p}>
        Le badge de certification est concédé sous licence non exclusive et révocable à l'entreprise certifiée pour la
        durée de validité de sa certification.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>9. Limitation de responsabilité</h2>
      <p style={S.p}>
        B&amp;E Consult s'engage à maintenir le Service disponible 99 % du temps sur une base mensuelle. En cas
        d'indisponibilité, la responsabilité de B&amp;E Consult est limitée au montant payé par l'utilisateur pour la
        certification concernée.
      </p>
      <p style={S.p}>
        B&amp;E Consult n'est pas responsable des dommages indirects, pertes de revenus ou préjudices commerciaux
        résultant de l'utilisation ou de l'impossibilité d'utiliser le Service.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>10. Droit applicable et juridiction</h2>
      <p style={S.p}>
        Les présentes CGU sont régies par le droit des Émirats Arabes Unis. Tout litige sera soumis aux tribunaux
        compétents de Dubai (DIFC Courts) après tentative de résolution amiable dans un délai de 30 jours.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>11. Modification des CGU</h2>
      <p style={S.p}>
        B&amp;E Consult se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront
        notifiés par email au moins 15 jours avant l'entrée en vigueur de toute modification substantielle.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>12. Contact</h2>
      <p style={S.p}>
        B&amp;E Consult FZCO · Dubai, Émirats Arabes Unis<br />
        Email : <a href="mailto:legal@mydd.work" style={S.link}>legal@mydd.work</a>
      </p>
    </>
  )
}

// ─── Privacy Policy content ──────────────────────────────────────────────────
function PrivacyContent() {
  return (
    <>
      <h1 style={S.h1}>Politique de Confidentialité</h1>
      <p style={S.meta}>
        MyDD Registry — B&amp;E Consult FZCO · Conforme RGPD (UE) 2016/679 · Dernière mise à jour : 21 avril 2026
      </p>

      <h2 style={S.h2}>1. Responsable du traitement</h2>
      <p style={S.p}>
        B&amp;E Consult FZCO, Dubai, Émirats Arabes Unis<br />
        Contact DPO : <a href="mailto:privacy@mydd.work" style={S.link}>privacy@mydd.work</a>
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>2. Données collectées</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Catégorie</th>
            <th style={S.th}>Données</th>
            <th style={S.th}>Base légale</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Identification', 'Nom, prénom, email professionnel', 'Exécution du contrat'],
            ['Entreprise', 'Raison sociale, SIRET/registre, secteur, pays', 'Exécution du contrat'],
            ['Documents', 'Documents de conformité uploadés (KYC, UBO, bilans)', 'Exécution du contrat'],
            ['Paiement', 'Historique des transactions (pas de CB)', 'Obligation légale'],
            ['Technique', 'Adresse IP, logs de connexion, user-agent', 'Intérêt légitime (sécurité)'],
            ['Navigation', 'Aucun cookie de tracking tiers', '—'],
          ].map(([cat, data, base]) => (
            <tr key={cat}>
              <td style={{ ...S.td, color: '#C9A84C', fontWeight: 600 }}>{cat}</td>
              <td style={S.td}>{data}</td>
              <td style={S.td}>{base}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr style={S.sep} />

      <h2 style={S.h2}>3. Finalités du traitement</h2>
      <ul style={S.ul}>
        <li style={S.li}>Délivrance et gestion des certifications</li>
        <li style={S.li}>Vérification d'identité et lutte contre la fraude</li>
        <li style={S.li}>Calcul du Trust Score (27 indicateurs)</li>
        <li style={S.li}>Envoi d'emails transactionnels (confirmation, expiration, onboarding)</li>
        <li style={S.li}>Maintien du registre public des entreprises certifiées</li>
        <li style={S.li}>Obligations légales et comptables</li>
      </ul>

      <hr style={S.sep} />

      <h2 style={S.h2}>4. Destinataires des données</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Sous-traitant</th>
            <th style={S.th}>Pays</th>
            <th style={S.th}>Finalité</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Railway Inc.', 'États-Unis', 'Hébergement serveur et base de données'],
            ['Stripe Inc.', 'États-Unis', 'Traitement des paiements'],
            ['Resend Inc.', 'États-Unis', "Envoi d'emails transactionnels"],
            ['Cloudflare R2', 'États-Unis', 'Stockage des documents uploadés'],
            ['Sentry Inc.', 'États-Unis', 'Monitoring des erreurs (données techniques uniquement)'],
          ].map(([name, country, purpose]) => (
            <tr key={name}>
              <td style={{ ...S.td, fontWeight: 600, color: '#e2e2e2' }}>{name}</td>
              <td style={S.td}>{country}</td>
              <td style={S.td}>{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={S.p}>
        Tous les sous-traitants sont soumis à des clauses contractuelles types (CCT) conformes au RGPD. Les transferts
        vers les États-Unis sont encadrés par le Data Privacy Framework (DPF) EU-US.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>5. Durée de conservation</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Données</th>
            <th style={S.th}>Durée</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Compte utilisateur actif', 'Durée de la relation contractuelle'],
            ['Données après fermeture du compte', '30 jours (anonymisation automatique)'],
            ['Logs de connexion et audit', '12 mois'],
            ['Documents de certification', '5 ans (obligation légale)'],
            ['Données de paiement', '7 ans (obligation comptable)'],
            ['Notifications', '90 jours (archivage automatique)'],
          ].map(([data, duration]) => (
            <tr key={data}>
              <td style={S.td}>{data}</td>
              <td style={{ ...S.td, color: '#C9A84C' }}>{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr style={S.sep} />

      <h2 style={S.h2}>6. Droits des personnes concernées</h2>
      <p style={S.p}>Conformément au RGPD, vous disposez des droits suivants :</p>
      <ul style={S.ul}>
        {[
          ['Droit d\'accès', 'obtenir une copie de vos données'],
          ['Droit de rectification', 'corriger des données inexactes'],
          ['Droit à l\'effacement', 'demander la suppression (« droit à l\'oubli »)'],
          ['Droit à la portabilité', 'recevoir vos données dans un format structuré'],
          ['Droit d\'opposition', 'vous opposer à certains traitements'],
          ['Droit à la limitation', 'restreindre temporairement un traitement'],
        ].map(([right, desc]) => (
          <li key={right} style={S.li}>
            <span style={S.strong}>{right}</span> — {desc}
          </li>
        ))}
      </ul>
      <p style={S.p}>
        <strong style={S.strong}>Pour exercer vos droits :</strong>{' '}
        <a href="mailto:privacy@mydd.work" style={S.link}>privacy@mydd.work</a> — réponse sous 30 jours.
      </p>
      <p style={S.p}>
        En cas de réclamation non résolue, vous pouvez saisir la <strong style={S.strong}>CNIL</strong> (France) :{' '}
        <a href="https://www.cnil.fr/fr/vous-souhaitez-contacter-la-cnil" target="_blank" rel="noreferrer" style={S.link}>
          cnil.fr
        </a>
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>7. Sécurité des données</h2>
      <p style={S.p}>B&amp;E Consult met en œuvre les mesures techniques suivantes :</p>
      <ul style={S.ul}>
        <li style={S.li}>Chiffrement des mots de passe (bcrypt, 10 rounds)</li>
        <li style={S.li}>Tokens JWT à durée limitée (15 minutes) + rotation des refresh tokens</li>
        <li style={S.li}>Connexions HTTPS uniquement (HSTS activé)</li>
        <li style={S.li}>Détection de fraude automatisée (7 règles actives)</li>
        <li style={S.li}>Journalisation de tous les accès (audit log)</li>
        <li style={S.li}>Sauvegardes automatiques Railway (point-in-time recovery)</li>
      </ul>

      <hr style={S.sep} />

      <h2 style={S.h2}>8. Cookies</h2>
      <p style={S.p}>
        MyDD Registry n'utilise <strong style={S.strong}>aucun cookie de tracking</strong> ni publicité comportementale.
        Les seuls cookies utilisés sont des cookies de session strictement nécessaires au fonctionnement du Service
        (authentification).
      </p>
      <p style={S.p}>
        Aucun consentement cookie n'est requis au sens de la directive ePrivacy pour ces cookies techniques.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>9. Registre public</h2>
      <p style={S.p}>
        Les informations affichées dans le registre public (nom de l'entreprise, pays, niveau de certification, Trust
        Score) constituent des données professionnelles publiées avec le consentement explicite de l'entreprise lors de
        l'inscription. Elles peuvent être retirées du registre sur simple demande à{' '}
        <a href="mailto:privacy@mydd.work" style={S.link}>privacy@mydd.work</a>.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>10. Modifications</h2>
      <p style={S.p}>
        Toute modification substantielle de cette politique sera notifiée par email 15 jours avant entrée en vigueur.
      </p>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
// `initialTab` prop lets /privacy and /terms routes open the correct tab directly.
export default function Legal({ tab: initialTab }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  // Priority: prop (from route) > query param > default
  const tab = initialTab || searchParams.get('tab') || 'cgu'

  return (
    <div style={S.page}>
      {/* Tab navigation */}
      <div style={S.tabBar}>
        {['cgu', 'privacy'].map(id => (
          <Link
            key={id}
            to={id === 'privacy' ? '/privacy' : '/terms'}
            style={S.tabBtn(tab === id)}
          >
            {id === 'cgu' ? t('legal.cgu_tab') : t('legal.privacy_tab')}
          </Link>
        ))}
      </div>

      {tab === 'cgu'     && <CGUContent />}
      {tab === 'privacy' && <PrivacyContent />}

      {/* Footer */}
      <div style={S.footer}>
        B&amp;E Consult FZCO · Dubai, UAE ·{' '}
        <a href="mailto:legal@mydd.work" style={S.link}>legal@mydd.work</a>
        {' · '}
        <Link to="/" style={S.link}>← Accueil</Link>
      </div>
    </div>
  )
}
