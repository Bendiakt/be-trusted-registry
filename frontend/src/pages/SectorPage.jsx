/**
 * SectorPage.jsx — Dynamic sector landing page for SEO
 *
 * Routes: /sectors/:sector
 * Renders a rich, sector-specific page with:
 *  - Curated copy per sector (FR/EN bilingual)
 *  - Live list of certified companies in that sector
 *  - schema.org ItemList + WebPage structured data
 *  - Responsive layout (uses landing.css utilities where needed)
 *
 * © 2024–2026 B&E Consult FZCO — All rights reserved.
 */
import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../lib/api'
import './landing.css'

/* ── Sector catalogue ──────────────────────────────────────────────────────── */
const SECTORS = {
  manufacturing: {
    slug:    'manufacturing',
    en: {
      name:      'Manufacturing',
      eyebrow:   'Sector verification',
      h1:        'Certified manufacturers on the MyDD registry',
      sub:       'MyDD helps buyers and trade finance teams verify manufacturers across 3 levels — from basic identity check to full on-site inspection.',
      stats:     ['Quality audit', 'On-site inspection', 'Document review'],
      faq: [
        { q: 'Why verify a manufacturer?', a: 'In cross-border trade, a manufacturer\'s certificate, quality credentials and legal status need to be independently confirmed before payment or long-term engagement.' },
        { q: 'What level is recommended for manufacturers?', a: 'Level 2 (Silver) covers documentary elements and financial data. Level 3 (Gold) adds an on-site PAC inspection.' },
      ],
    },
    fr: {
      name:      'Industrie',
      eyebrow:   'Vérification sectorielle',
      h1:        'Fabricants certifiés sur le registre MyDD',
      sub:       'MyDD aide les acheteurs et les équipes trade finance à vérifier les fabricants selon 3 niveaux — du contrôle identitaire simple à l\'inspection terrain.',
      stats:     ['Audit qualité', 'Inspection terrain', 'Revue documentaire'],
      faq: [
        { q: 'Pourquoi vérifier un fabricant ?', a: 'En commerce international, les certifications, les accréditations qualité et le statut légal d\'un fabricant doivent être confirmés de façon indépendante avant tout engagement ou paiement.' },
        { q: 'Quel niveau est recommandé ?', a: 'Le niveau 2 (Silver) couvre les éléments documentaires et financiers. Le niveau 3 (Gold) ajoute une inspection terrain par agent PAC.' },
      ],
    },
  },
  logistics: {
    slug: 'logistics',
    en: {
      name:    'Logistics & Freight',
      eyebrow: 'Sector verification',
      h1:      'Certified logistics & freight companies on MyDD',
      sub:     'Verify freight forwarders, shipping agents and logistics providers before you commit cargo or capital.',
      stats:   ['Licence verification', 'Document check', 'AML screening'],
      faq: [
        { q: 'What documents are reviewed for logistics companies?', a: 'MyDD reviews freight licences, NVOCC registration, insurance certificates, and director identity documents.' },
        { q: 'Can I export a verification report?', a: 'Yes — verified companies at Level 2+ receive a downloadable PDF certificate for your compliance files.' },
      ],
    },
    fr: {
      name:    'Logistique & Fret',
      eyebrow: 'Vérification sectorielle',
      h1:      'Acteurs logistiques & fret certifiés sur MyDD',
      sub:     'Vérifiez les transitaires, agents maritimes et prestataires logistiques avant de confier une cargaison ou un paiement.',
      stats:   ['Vérification licence', 'Contrôle documentaire', 'Screening AML'],
      faq: [
        { q: 'Quels documents sont examinés ?', a: 'MyDD examine les licences de fret, l\'immatriculation NVOCC, les attestations d\'assurance et les pièces d\'identité des dirigeants.' },
        { q: 'Puis-je exporter un rapport de vérification ?', a: 'Oui — les entreprises certifiées au niveau 2+ reçoivent un certificat PDF téléchargeable pour vos dossiers de conformité.' },
      ],
    },
  },
  agribusiness: {
    slug: 'agribusiness',
    en: {
      name:    'Agribusiness',
      eyebrow: 'Sector verification',
      h1:      'Certified agribusiness companies on MyDD',
      sub:     'MyDD provides structured verification for agricultural traders, exporters and processors operating in cross-border supply chains.',
      stats:   ['Export licence check', 'Phytosanitary docs', 'On-site inspection'],
      faq: [
        { q: 'Is agribusiness verification different from manufacturing?', a: 'The verification framework is the same, but PAC experts assigned to agribusiness missions have sector-specific expertise.' },
        { q: 'Can MyDD verify international grain traders?', a: 'Yes — MyDD supports verification of exporters, trading houses and processors operating in any agricultural commodity.' },
      ],
    },
    fr: {
      name:    'Agro-industrie',
      eyebrow: 'Vérification sectorielle',
      h1:      'Entreprises agro-industrielles certifiées sur MyDD',
      sub:     'MyDD propose un cadre de vérification structuré pour les traders agricoles, exportateurs et transformateurs opérant en chaînes d\'approvisionnement internationales.',
      stats:   ['Vérification licence export', 'Documents phytosanitaires', 'Inspection terrain'],
      faq: [
        { q: 'La vérification agro est-elle différente ?', a: 'Le cadre de vérification est identique, mais les experts PAC affectés aux missions agro disposent d\'une expertise sectorielle spécifique.' },
        { q: 'MyDD peut-il vérifier des traders de céréales ?', a: 'Oui — MyDD prend en charge la vérification des exportateurs, maisons de négoce et transformateurs dans tout secteur de matières premières agricoles.' },
      ],
    },
  },
  technology: {
    slug: 'technology',
    en: {
      name:    'Technology',
      eyebrow: 'Sector verification',
      h1:      'Certified technology companies on MyDD',
      sub:     'Verify IT vendors, software providers and technology exporters before signing contracts or initiating cross-border payments.',
      stats:   ['IP ownership check', 'Director identity', 'AML compliance'],
      faq: [
        { q: 'Why verify a technology vendor?', a: 'Technology procurement often involves upfront payment or access to critical infrastructure. Independent verification reduces fraud and compliance risk.' },
        { q: 'What is covered in a Level 1 tech verification?', a: 'Management identity, legal existence and declared address — a fast credibility baseline for low-value or early-stage engagements.' },
      ],
    },
    fr: {
      name:    'Technologie',
      eyebrow: 'Vérification sectorielle',
      h1:      'Entreprises technologiques certifiées sur MyDD',
      sub:     'Vérifiez les fournisseurs IT, éditeurs logiciels et exportateurs de technologie avant la signature de contrats ou les paiements transfrontaliers.',
      stats:   ['Vérification PI', 'Identité dirigeants', 'Conformité AML'],
      faq: [
        { q: 'Pourquoi vérifier un fournisseur technologique ?', a: 'Les achats technologiques impliquent souvent un paiement anticipé ou un accès à des infrastructures critiques. Une vérification indépendante réduit les risques de fraude et de conformité.' },
        { q: 'Que couvre le niveau 1 pour la tech ?', a: 'Identité des dirigeants, existence légale et adresse déclarée — base de crédibilité rapide pour des engagements à faible valeur ou en phase initiale.' },
      ],
    },
  },
  'trade-finance': {
    slug: 'trade-finance',
    en: {
      name:    'Trade Finance',
      eyebrow: 'Sector verification',
      h1:      'Certified trade finance companies on MyDD',
      sub:     'MyDD helps banks, funds and trade finance teams verify counterparties and underlying borrowers in cross-border transactions.',
      stats:   ['KYC documentation', 'AML screening', 'Beneficial ownership'],
      faq: [
        { q: 'Can MyDD reports be used for KYC purposes?', a: 'MyDD reports document a structured verification process and can supplement (not replace) your institution\'s internal KYC procedures.' },
        { q: 'Does MyDD cover beneficial ownership?', a: 'Level 2 and Level 3 reviews include documentary elements on ownership structure. Level 3 adds on-site PAC inspection.' },
      ],
    },
    fr: {
      name:    'Trade Finance',
      eyebrow: 'Vérification sectorielle',
      h1:      'Entreprises trade finance certifiées sur MyDD',
      sub:     'MyDD aide les banques, fonds et équipes trade finance à vérifier contreparties et débiteurs sous-jacents dans les transactions transfrontalières.',
      stats:   ['Documentation KYC', 'Screening AML', 'Bénéficiaires effectifs'],
      faq: [
        { q: 'Les rapports MyDD peuvent-ils servir au KYC ?', a: 'Les rapports MyDD documentent un processus de vérification structuré et peuvent compléter (sans remplacer) les procédures KYC internes de votre établissement.' },
        { q: 'MyDD couvre-t-il la propriété effective ?', a: 'Les revues niveau 2 et 3 incluent des éléments documentaires sur la structure de propriété. Le niveau 3 ajoute une inspection terrain PAC.' },
      ],
    },
  },
}

const T = {
  bg: '#f7f6f2', surface: '#f9f8f5', surface2: '#fbfbf9', offset: '#f3f0ec',
  border: 'rgba(40,37,29,0.1)', text: '#28251d', muted: '#6e6a63', faint: '#9b988f',
  primary: '#01696f', primaryH: '#0c4e54', inverse: '#f9f8f4',
  teal10: 'rgba(1,105,111,0.08)', teal20: 'rgba(1,105,111,0.18)',
  goldBronze: '#CD7F32', goldSilver: '#A8A9AD', goldGold: '#C9A84C',
}
const LEVEL_LABEL = { 1: 'Bronze', 2: 'Silver', 3: 'Gold' }
const LEVEL_COLOR = { 1: T.goldBronze, 2: T.goldSilver, 3: T.goldGold }

export default function SectorPage() {
  const { sector }    = useParams()
  const navigate      = useNavigate()
  const { t, i18n }  = useTranslation()
  const lang          = i18n.language?.startsWith('fr') ? 'fr' : 'en'
  const [companies, setCompanies] = useState([])
  const [total, setTotal]         = useState(null)
  const [loading, setLoading]     = useState(true)

  const meta = SECTORS[sector]
  const C    = meta?.[lang] || meta?.en

  /* Redirect unknown sectors */
  useEffect(() => {
    if (!meta) navigate('/registry', { replace: true })
  }, [meta, navigate])

  /* Meta tags + structured data */
  useEffect(() => {
    if (!C) return
    const BASE = 'https://mydd.work'
    document.title = `${C.name} supplier verification — MyDD`
    const setMeta = (sel, attrs) => {
      let el = document.querySelector(sel)
      if (!el) { el = document.createElement('meta'); document.head.appendChild(el) }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      return el
    }
    const added = [
      setMeta('meta[name="description"]',        { name: 'description',  content: C.sub }),
      setMeta('meta[property="og:title"]',        { property: 'og:title', content: `${C.name} supplier verification — MyDD` }),
      setMeta('meta[property="og:description"]',  { property: 'og:description', content: C.sub }),
      setMeta('meta[property="og:url"]',           { property: 'og:url',  content: `${BASE}/sectors/${sector}` }),
      setMeta('meta[name="robots"]',              { name: 'robots',       content: 'index, follow' }),
    ]
    return () => added.forEach(el => { try { el.remove() } catch {} })
  }, [C, sector])

  /* Structured data injection */
  useEffect(() => {
    if (!C || !companies.length) return
    const BASE = 'https://mydd.work'
    const schema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: `${C.name} supplier verification — MyDD`,
          description: C.sub,
          url: `${BASE}/sectors/${sector}`,
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'MyDD', item: BASE },
              { '@type': 'ListItem', position: 2, name: 'Sectors', item: `${BASE}/sectors` },
              { '@type': 'ListItem', position: 3, name: C.name, item: `${BASE}/sectors/${sector}` },
            ],
          },
        },
        {
          '@type': 'ItemList',
          name: `${C.name} — certified suppliers`,
          numberOfItems: total,
          itemListElement: companies.slice(0, 10).map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${BASE}/verify/${c.id}`,
            name: c.name,
          })),
        },
        {
          '@type': 'FAQPage',
          mainEntity: C.faq.map(f => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        },
      ],
    }
    const el = document.getElementById('sector-schema') || document.createElement('script')
    el.id   = 'sector-schema'
    el.type = 'application/ld+json'
    el.textContent = JSON.stringify(schema)
    if (!el.parentNode) document.head.appendChild(el)
    return () => { try { el.remove() } catch {} }
  }, [C, companies, total, sector])

  /* Fetch companies */
  useEffect(() => {
    if (!meta) return
    setLoading(true)
    api.get(`/api/registry?sector=${encodeURIComponent(C.name)}&limit=12&page=1`)
      .then(res => {
        setCompanies(res.data.data || [])
        setTotal(res.data.pagination?.total ?? 0)
      })
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false))
  }, [sector]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!meta || !C) return null

  const S = {
    page:    { minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'General Sans','Inter',system-ui,sans-serif", overflowX: 'hidden' },
    header:  { background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '1rem clamp(1rem,4vw,1.5rem)' },
    hInner:  { maxWidth: '1040px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
    container: { maxWidth: '1040px', margin: '0 auto', padding: '0 clamp(1rem,4vw,1.5rem)' },
    section: { padding: 'clamp(3rem,5vw,5rem) 0' },
    eyebrow: { textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.72rem', color: T.muted, marginBottom: '0.75rem' },
    h1:    { fontFamily: "'Georgia','Times New Roman',serif", fontSize: 'clamp(1.75rem,3.5vw,3rem)', fontWeight: '700', lineHeight: '1.05', letterSpacing: '-0.025em', margin: '0 0 1.25rem', color: T.text },
    h2:    { fontFamily: "'Georgia','Times New Roman',serif", fontSize: 'clamp(1.25rem,2.5vw,1.75rem)', fontWeight: '700', lineHeight: '1.1', margin: '0 0 0.75rem', color: T.text },
    p:     { color: T.muted, lineHeight: '1.7', margin: '0 0 1rem' },
    card:  { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '1.25rem', transition: 'border-color 0.2s' },
    btnPrimary: { display: 'inline-flex', alignItems: 'center', padding: '0.65rem 1.3rem', background: T.primary, color: T.inverse, border: 'none', borderRadius: '999px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit' },
    btnSecondary: { display: 'inline-flex', alignItems: 'center', padding: '0.6rem 1.2rem', background: 'transparent', color: T.text, border: `1px solid ${T.border}`, borderRadius: '999px', fontWeight: '500', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit' },
  }

  const SECTORS_ALL = Object.values(SECTORS)

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.hInner}>
          <Link to="/" style={{ display:'flex', alignItems:'center', gap:'0.6rem', textDecoration:'none', color: T.text }}>
            <svg width={28} height={28} viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <rect x="6" y="10" width="22" height="44" rx="8" stroke={T.primary} strokeWidth="4"/>
              <path d="M17 22L17 42" stroke={T.primary} strokeWidth="4" strokeLinecap="round"/>
              <path d="M36 18H44C52.837 18 60 25.163 60 34C60 42.837 52.837 50 44 50H36V18Z" stroke={T.primary} strokeWidth="4"/>
              <path d="M42 24H44C49.523 24 54 28.477 54 34C54 39.523 49.523 44 44 44H42" stroke={T.primary} strokeWidth="4" strokeLinecap="round"/>
            </svg>
            <strong style={{ fontSize:'0.95rem' }}>MyDD</strong>
          </Link>
          <nav style={{ display:'flex', gap:'1rem', alignItems:'center', flexWrap:'wrap' }}>
            <Link to="/registry" style={{ fontSize:'0.85rem', color: T.muted, textDecoration:'none' }}>
              {t('sector.registry_link')}
            </Link>
            <Link to="/register" style={S.btnPrimary}>
              {t('sector.get_certified')}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Breadcrumb */}
        <div style={{ ...S.container, paddingTop: '1.25rem' }}>
          <nav aria-label="Breadcrumb" style={{ fontSize:'0.8rem', color: T.faint }}>
            <Link to="/"        style={{ color: T.faint, textDecoration:'none' }}>MyDD</Link>
            <span style={{ margin:'0 0.4rem' }}>›</span>
            <Link to="/registry" style={{ color: T.faint, textDecoration:'none' }}>
              {t('sector.registry_link')}
            </Link>
            <span style={{ margin:'0 0.4rem' }}>›</span>
            <span style={{ color: T.muted }}>{C.name}</span>
          </nav>
        </div>

        {/* Hero */}
        <section style={{ ...S.section, paddingBottom: 'clamp(2rem,4vw,4rem)' }}>
          <div style={S.container}>
            <div style={S.eyebrow}>{C.eyebrow}</div>
            <h1 style={S.h1}>{C.h1}</h1>
            <p style={{ ...S.p, maxWidth: '62ch', fontSize: '1.05rem' }}>{C.sub}</p>
            {/* Stats pills */}
            <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap', marginTop:'1.25rem' }}>
              {C.stats.map((s, i) => (
                <span key={i} style={{ padding:'0.3rem 0.85rem', background: T.teal10, border:`1px solid ${T.teal20}`, borderRadius:'999px', fontSize:'0.8rem', fontWeight:'600', color: T.primary }}>✓ {s}</span>
              ))}
            </div>
            {total !== null && (
              <p style={{ ...S.p, marginTop:'1rem', fontSize:'0.85rem' }}>
                {t('sector.total', { count: total })}
              </p>
            )}
          </div>
        </section>

        {/* Company list */}
        <section style={{ ...S.section, background: T.surface, paddingTop: 'clamp(2.5rem,4vw,4rem)' }}>
          <div style={S.container}>
            <h2 style={S.h2}>
              {t('sector.certified_companies')}
              {total !== null && <span style={{ fontSize:'0.8rem', fontWeight:'400', color: T.faint, marginLeft:'0.6rem' }}>({total})</span>}
            </h2>

            {loading && (
              <div style={{ display:'grid', gap:'1rem', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', marginTop:'1.5rem' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ ...S.card, height:'100px', background: T.offset, animation:'pulse 1.5s infinite' }}/>
                ))}
              </div>
            )}

            {!loading && !companies.length && (
              <div style={{ textAlign:'center', padding:'3rem 0', color: T.muted }}>
                <div style={{ fontSize:'2.5rem', marginBottom:'1rem', opacity:0.3 }}>🏭</div>
                <p style={{ ...S.p, margin:0 }}>
                  {t('sector.no_companies')}
                </p>
                <div style={{ marginTop:'1.5rem' }}>
                  <Link to="/register" style={S.btnPrimary}>
                    {t('sector.be_first')}
                  </Link>
                </div>
              </div>
            )}

            {!loading && companies.length > 0 && (
              <div style={{ display:'grid', gap:'1rem', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', marginTop:'1.5rem' }}>
                {companies.map(c => (
                  <Link key={c.id} to={`/verify/${c.id}`} style={{ ...S.card, textDecoration:'none', display:'block', color:'inherit' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.teal20}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem' }}>
                      <strong style={{ fontSize:'0.95rem', color: T.text }}>{c.name}</strong>
                      {c.level > 0 && (
                        <span style={{ flexShrink:0, fontSize:'0.72rem', fontWeight:'700', color: LEVEL_COLOR[c.level], background:`${LEVEL_COLOR[c.level]}18`, border:`1px solid ${LEVEL_COLOR[c.level]}44`, borderRadius:'999px', padding:'0.2rem 0.55rem', whiteSpace:'nowrap' }}>
                          {LEVEL_LABEL[c.level]}
                        </span>
                      )}
                    </div>
                    <p style={{ ...S.p, fontSize:'0.8rem', margin:'0.4rem 0 0', color: T.faint }}>
                      {[c.country, c.sector].filter(Boolean).join(' · ')}
                    </p>
                  </Link>
                ))}
              </div>
            )}

            {!loading && (
              <div style={{ marginTop:'2rem', textAlign:'center' }}>
                <Link to={`/registry?sector=${encodeURIComponent(C.name)}`} style={S.btnSecondary}>
                  {t('sector.view_all')}
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* FAQ */}
        <section style={{ ...S.section, paddingBottom: 'clamp(3rem,5vw,5rem)' }}>
          <div style={{ ...S.container, maxWidth:'760px' }}>
            <h2 style={{ ...S.h2, marginBottom:'1.5rem' }}>
              {t('sector.faq_heading')}
            </h2>
            {C.faq.map((f, i) => (
              <details key={i} style={{ borderBottom:`1px solid ${T.border}`, padding:'1rem 0', cursor:'pointer' }}>
                <summary style={{ fontWeight:'600', fontSize:'0.95rem', color: T.text, listStyle:'none', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'1rem' }}>
                  {f.q}
                  <span style={{ fontSize:'0.75rem', color: T.faint, flexShrink:0 }}>+</span>
                </summary>
                <p style={{ ...S.p, marginTop:'0.75rem', marginBottom:0, fontSize:'0.92rem' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding:'clamp(2.5rem,5vw,4rem) 0', background: T.surface }}>
          <div style={{ ...S.container, maxWidth:'680px', textAlign:'center' }}>
            <h2 style={{ ...S.h2, fontSize:'clamp(1.3rem,2.5vw,1.75rem)' }}>
              {t('sector.cta_heading')}
            </h2>
            <p style={{ ...S.p, marginBottom:'1.5rem' }}>
              {t('sector.cta_sub', { name: C.name })}
            </p>
            <div style={{ display:'flex', gap:'0.75rem', justifyContent:'center', flexWrap:'wrap' }}>
              <Link to="/register" style={S.btnPrimary}>
                {t('sector.request_verification')}
              </Link>
              <Link to="/registry" style={S.btnSecondary}>
                {t('sector.browse_registry')}
              </Link>
            </div>
          </div>
        </section>

        {/* Browse other sectors */}
        <section style={{ ...S.section, paddingTop: 'clamp(2rem,4vw,3rem)' }}>
          <div style={S.container}>
            <h2 style={{ ...S.h2, fontSize:'1rem', marginBottom:'1rem', color: T.muted, fontFamily:'inherit', fontWeight:'600', letterSpacing:'0.04em', textTransform:'uppercase' }}>
              {t('sector.other_sectors')}
            </h2>
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
              {SECTORS_ALL.filter(s => s.slug !== sector).map(s => (
                <Link key={s.slug} to={`/sectors/${s.slug}`}
                  style={{ padding:'0.4rem 0.9rem', background: T.surface, border:`1px solid ${T.border}`, borderRadius:'999px', fontSize:'0.82rem', color: T.muted, textDecoration:'none', transition:'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.teal20}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                >
                  {s[lang]?.name || s.en.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ padding:'2rem 0 3rem', borderTop:`1px solid ${T.border}` }}>
        <div style={{ ...S.container, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem' }}>
          <div style={{ fontSize:'0.8rem', color: T.faint }}>
            © {new Date().getFullYear()} B&amp;E Consult FZCO. MyDD® — <Link to="/legal" style={{ color: T.faint }}>Legal</Link>
          </div>
          <div style={{ display:'flex', gap:'1rem' }}>
            <Link to="/registry" style={{ fontSize:'0.82rem', color: T.muted, textDecoration:'none' }}>Registry</Link>
            <Link to="/agents"   style={{ fontSize:'0.82rem', color: T.muted, textDecoration:'none' }}>PAC Agents</Link>
            <Link to="/register" style={{ fontSize:'0.82rem', color: T.muted, textDecoration:'none' }}>
              {t('sector.get_certified')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
