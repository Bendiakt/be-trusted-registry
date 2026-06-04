import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()

  const channels = [
    ['support@mydd.work', t('support.purpose_support')],
    ['privacy@mydd.work', t('support.purpose_privacy')],
    ['legal@mydd.work', t('support.purpose_legal')],
  ]
  const slaRows = [
    [t('support.prio_critical'), t('support.ex_critical'), t('support.sla_critical')],
    [t('support.prio_high'), t('support.ex_high'), t('support.sla_high')],
    [t('support.prio_normal'), t('support.ex_normal'), t('support.sla_normal')],
    [t('support.prio_gdpr'), t('support.ex_gdpr'), t('support.sla_gdpr')],
  ]

  return (
    <div style={S.page}>
      <h1 style={S.h1}>{t('support.title')}</h1>
      <p style={S.meta}>MyDD Registry — B&amp;E Consult FZCO · Dubai, UAE</p>

      <h2 style={S.h2}>{t('support.contact_heading')}</h2>
      <p style={S.p}>{t('support.contact_intro')}</p>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>{t('support.col_address')}</th>
            <th style={S.th}>{t('support.col_purpose')}</th>
          </tr>
        </thead>
        <tbody>
          {channels.map(([email, purpose]) => (
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

      <h2 style={S.h2}>{t('support.sla_heading')}</h2>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>{t('support.col_priority')}</th>
            <th style={S.th}>{t('support.col_example')}</th>
            <th style={S.th}>{t('support.col_first_response')}</th>
          </tr>
        </thead>
        <tbody>
          {slaRows.map(([prio, ex, sla]) => (
            <tr key={prio}>
              <td style={{ ...S.td, color: '#C9A84C', fontWeight: 600 }}>{prio}</td>
              <td style={S.td}>{ex}</td>
              <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{sla}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={S.p}>{t('support.business_hours')}</p>

      <hr style={S.sep} />

      <h2 style={S.h2}>{t('support.rgpd_heading')}</h2>
      <p style={S.p}>{t('support.rgpd_intro')}</p>
      <ul style={S.ul}>
        <li style={S.li}>
          <span style={S.strong}>{t('support.rgpd_access_label')}</span> — {t('support.rgpd_access_desc')}
        </li>
        <li style={S.li}>
          <span style={S.strong}>{t('support.rgpd_erasure_label')}</span> — {t('support.rgpd_erasure_desc')}
        </li>
        <li style={S.li}>
          <span style={S.strong}>{t('support.rgpd_other_label')}</span> — {t('support.rgpd_other_desc')}
        </li>
      </ul>
      <p style={S.p}>
        {t('support.rgpd_details')}{' '}
        <Link to="/privacy" style={S.link}>{t('support.privacy_policy')}</Link>.
      </p>

      <hr style={S.sep} />

      <h2 style={S.h2}>{t('support.docs_heading')}</h2>
      <ul style={S.ul}>
        <li style={S.li}><Link to="/terms" style={S.link}>{t('support.doc_terms')}</Link></li>
        <li style={S.li}><Link to="/privacy" style={S.link}>{t('support.doc_privacy')}</Link></li>
        <li style={S.li}><Link to="/registry" style={S.link}>{t('support.doc_registry')}</Link></li>
      </ul>

      <div style={S.footer}>
        B&amp;E Consult FZCO · Dubai, UAE ·{' '}
        <a href="mailto:support@mydd.work" style={S.link}>support@mydd.work</a>
        {' · '}
        <Link to="/" style={S.link}>← {t('support.back_home')}</Link>
      </div>
    </div>
  )
}
