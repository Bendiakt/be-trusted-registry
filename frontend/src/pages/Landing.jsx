/**
 * Landing.jsx — MyDD public homepage
 * Design: editorial, minimal, bilingual FR/EN with DeepL extension
 * © 2024–2026 B&E Consult FZCO — All rights reserved.
 * Proprietary and confidential. Unauthorised reproduction prohibited.
 *
 * @trademark MyDD® · PAC Network® · B&E Consult FZCO®
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import './landing.css'

// ── Bilingual content — authoritative source (FR / EN) ────────────────────────
// Derived from MyDD Master Copy File © B&E Consult FZCO
const COPY = {
  fr: {
    nav: {
      buyers:    'Acheteurs',
      companies: 'Entreprises',
      pac:       'Experts PAC',
      legal:     'Cadre légal',
      registry:  'Registre',
      cta:       'Demander une démo',
    },
    hero: {
      eyebrow: 'Plateforme privée de vérification commerciale',
      h1:      'Vérification commerciale structurée pour le commerce international',
      sub:     'MyDD aide les entreprises, acheteurs et partenaires à mieux documenter une contrepartie grâce à une vérification progressive, un registre public et, selon le niveau, une inspection terrain.',
      body:    "Opéré par B&E Consult FZCO, MyDD est un service privé conçu pour améliorer la lisibilité d'un dossier commercial dans des environnements cross-border et multi-juridictions.",
      cta1:    'Demander une démo',
      cta2:    'Vérifier un profil',
      cta3:    'Rejoindre la bêta',
    },
    deliverables: {
      title: 'Livrables clés',
      items: ['Badge public selon niveau', 'Rapport PDF structuré', 'Profil registre', 'Historique documentaire et suivi'],
    },
    problem: {
      h2:  'Quand l\'information est dispersée, la décision ralentit.',
      p:   'En commerce international, il est souvent difficile d\'évaluer rapidement la qualité réelle d\'une contrepartie. Un site web, un profil LinkedIn et des documents fournis par la partie elle-même ne suffisent pas toujours à produire une base de décision robuste.',
    },
    solution: {
      h2: 'Un cadre structuré pour lire, partager et archiver des éléments de confiance.',
      p:  'MyDD apporte un cadre de vérification plus structuré : collecte documentaire, revue standardisée, livrables lisibles et inspection terrain lorsque le niveau choisi l\'exige.',
    },
    audiences: [
      { title: 'Pour les acheteurs',       desc: 'Mieux qualifier une contrepartie avant un onboarding, un paiement ou une négociation avancée.' },
      { title: 'Pour les entreprises',     desc: 'Présenter à des tiers des éléments vérifiés de manière plus lisible et plus structurée.' },
      { title: 'Pour finance / compliance',desc: 'Conserver un historique et fluidifier une première revue interne.' },
      { title: 'Pour les experts PAC',     desc: 'Intervenir dans un cadre méthodologique défini, avec protocole et validation qualité.' },
    ],
    process: {
      h2:   'Un processus simple, des livrables plus lisibles.',
      sub:  'MyDD structure la vérification en quatre étapes, avec un niveau de profondeur adapté au contexte commercial.',
      steps: [
        { n: '01', title: 'Création du dossier',    desc: 'L\'entreprise crée son profil et choisit un niveau de vérification.' },
        { n: '02', title: 'Dépôt documentaire',     desc: 'Les documents requis sont déposés dans un environnement sécurisé.' },
        { n: '03', title: 'Vérification',           desc: 'Revue documentaire ou mission terrain selon le niveau choisi.' },
        { n: '04', title: 'Restitution',            desc: 'Badge, certificat, rapport et profil public selon le niveau sélectionné.' },
      ],
    },
    levels: {
      h2:     'Trois niveaux pour trois profondeurs de lecture.',
      sub:    'Chaque niveau correspond à un périmètre de vérification défini. Il ne constitue ni une garantie de solvabilité, ni une garantie de bonne exécution, ni une validation réglementaire automatique.',
      tiers: [
        { label: 'Bronze', level: 'Level 1', sub: 'Une base simple de crédibilité.', items: ['Identité des dirigeants', 'Existence légale', 'Adresse déclarée'] },
        { label: 'Silver', level: 'Level 2', sub: 'Un dossier renforcé par des éléments complémentaires.', featured: true, items: ['Inclut Bronze', 'Éléments documentaires sélectionnés', 'Éléments financiers et opérationnels'] },
        { label: 'Gold',   level: 'Level 3', sub: 'Une couche terrain lorsque le contexte l\'exige.', items: ['Inclut Silver', 'Inspection terrain par agent PAC', 'Rapport détaillé selon protocole'] },
      ],
    },
    buyers: {
      eyebrow: 'Pour les acheteurs',
      h2:      'Mieux évaluer une contrepartie avant de s\'engager.',
      p:       'MyDD aide les acheteurs, importateurs, brokers, fonds et équipes trade finance à structurer une revue plus homogène d\'un fournisseur ou partenaire commercial.',
      items:   ['Consultation d\'un profil vérifié selon niveau', 'Téléchargement de documents et certificats', 'Historique et suivi d\'expiration', 'Base plus cohérente pour une première revue interne'],
    },
    companies: {
      eyebrow: 'Pour les entreprises',
      h2:      'Montrer plus clairement qui vous êtes à vos futurs partenaires.',
      p:       'MyDD aide les entreprises à présenter à des tiers des éléments vérifiés de manière plus indépendante, plus lisible et plus structurée.',
      items:   ['Dossier plus structuré', 'Meilleure lisibilité externe', 'Partage simplifié avec prospects et partenaires', 'Renforcement de la présentation commerciale'],
    },
    pac: {
      eyebrow: 'Pour les experts PAC',
      h2:      'Rejoindre un cadre structuré pour les missions documentaires et terrain.',
      p:       'Le réseau PAC rassemble des experts indépendants appelés à intervenir selon leur zone géographique, leur qualification et la nature des missions.',
      path:    ['Candidature', 'Évaluation', 'Activation', 'Missions', 'Rapport', 'Progression'],
      levels:  ['S1 Associate', 'S2 Certified', 'S3 Senior Expert'],
    },
    legal: {
      h2:   'Un cadre clair renforce la confiance.',
      p:    'MyDD est une plateforme privée de vérification commerciale opérée par B&E Consult FZCO. Les badges, certificats, rapports et profils publiés reflètent un périmètre de vérification fondé sur les documents reçus, les contrôles réalisés et, selon le cas, des observations terrain.',
      notice: 'Ces éléments ne constituent ni une garantie de solvabilité, ni une garantie de bonne exécution, ni un avis juridique, ni un audit légal, ni une validation réglementaire automatique.',
    },
    cta: {
      h2: 'Construire une relation commerciale commence par une information plus lisible.',
      p:  'Que vous soyez acheteur, entreprise candidate à la vérification ou expert PAC, MyDD vous donne un cadre plus structuré et plus partageable.',
    },
    footer: {
      pages: ['Acheteurs', 'Entreprises', 'Experts PAC', 'Registre', 'À propos', 'Legal'],
      links: ['/registry', '/register', '/agents', '/registry', '/registry', '/legal'],
    },
  },
  en: {
    nav: {
      buyers:    'Buyers',
      companies: 'Companies',
      pac:       'PAC Experts',
      legal:     'Framework',
      registry:  'Registry',
      cta:       'Request a demo',
    },
    hero: {
      eyebrow: 'Private commercial verification platform',
      h1:      'Structured commercial verification for international trade',
      sub:     'MyDD helps companies, buyers and partners better document a counterparty through progressive verification, a public registry and, depending on the level, an on-site inspection.',
      body:    'Operated by B&E Consult FZCO, MyDD is a private service designed to improve the readability of a commercial file across borders and jurisdictions.',
      cta1:    'Request a demo',
      cta2:    'Verify a profile',
      cta3:    'Join the beta',
    },
    deliverables: {
      title: 'Core deliverables',
      items: ['Public badge depending on level', 'Structured PDF report', 'Registry profile', 'Document history and tracking'],
    },
    problem: {
      h2: 'When information is fragmented, decisions slow down.',
      p:  'In international trade, it is often difficult to quickly assess the real quality of a counterparty. A website, a LinkedIn page and documents provided by the party itself do not always create a sufficiently robust basis for decision-making.',
    },
    solution: {
      h2: 'A structured framework to read, share and retain trust elements.',
      p:  'MyDD provides a more structured verification framework: document collection, standardized review, readable deliverables and on-site inspection where the selected level requires it.',
    },
    audiences: [
      { title: 'For buyers',           desc: 'Better qualify a counterparty before onboarding, payment or advanced negotiation.' },
      { title: 'For companies',        desc: 'Present independently verified elements to third parties in a clearer and more structured way.' },
      { title: 'For finance / compliance', desc: 'Retain history and streamline a first-level internal review.' },
      { title: 'For PAC experts',      desc: 'Operate within a defined methodological framework with protocol and quality validation.' },
    ],
    process: {
      h2:   'A simple process, clearer deliverables.',
      sub:  'MyDD structures verification in four steps, with a level of depth adapted to the commercial context.',
      steps: [
        { n: '01', title: 'File creation',        desc: 'The company creates its profile and selects a verification level.' },
        { n: '02', title: 'Document submission',  desc: 'Required documents are uploaded to a secure environment.' },
        { n: '03', title: 'Verification',         desc: 'Document review or field mission depending on the selected level.' },
        { n: '04', title: 'Delivery',             desc: 'Badge, certificate, report and public profile depending on the selected level.' },
      ],
    },
    levels: {
      h2:  'Three levels for three depths of review.',
      sub: 'Each level corresponds to a defined verification scope. It does not constitute a guarantee of solvency, future performance or automatic regulatory validation.',
      tiers: [
        { label: 'Bronze', level: 'Level 1', sub: 'A simple credibility baseline.', items: ['Management identity', 'Legal existence', 'Declared address'] },
        { label: 'Silver', level: 'Level 2', sub: 'A stronger file with additional elements.', featured: true, items: ['Includes Bronze', 'Selected documentary elements', 'Financial and operational elements'] },
        { label: 'Gold',   level: 'Level 3', sub: 'A field layer when context requires it.', items: ['Includes Silver', 'On-site inspection by PAC agent', 'Detailed report under protocol'] },
      ],
    },
    buyers: {
      eyebrow: 'For buyers',
      h2:      'Assess counterparties more clearly before you commit.',
      p:       'MyDD helps buyers, importers, brokers, funds and trade finance teams structure a more consistent review of a supplier or commercial counterparty.',
      items:   ['Access to a level-based verified profile', 'Downloadable documents and certificates', 'History and expiry tracking', 'A more consistent basis for first-level internal review'],
    },
    companies: {
      eyebrow: 'For companies',
      h2:      'Present your business more clearly to future partners.',
      p:       'MyDD helps companies present independently verified trust elements in a clearer and more structured way to third parties.',
      items:   ['More structured file', 'Better external readability', 'Easier sharing with prospects and partners', 'Stronger commercial presentation'],
    },
    pac: {
      eyebrow: 'For PAC experts',
      h2:      'Join a structured framework for documentary and field assignments.',
      p:       'The PAC network brings together independent experts assigned based on geography, qualification and mission type.',
      path:    ['Application', 'Evaluation', 'Activation', 'Missions', 'Reporting', 'Progression'],
      levels:  ['S1 Associate', 'S2 Certified', 'S3 Senior Expert'],
    },
    legal: {
      h2:     'A clear framework strengthens trust.',
      p:      'MyDD is a private commercial verification platform operated by B&E Consult FZCO. The badges, certificates, reports and profiles published reflect a verification scope based on received documents, performed checks and, where applicable, field observations.',
      notice: 'These elements do not constitute a guarantee of solvency, future performance, legal advice, statutory audit or automatic regulatory validation.',
    },
    cta: {
      h2: 'Better commercial relationships start with more readable information.',
      p:  'Whether you are a buyer, a company applying for verification or a PAC expert, MyDD gives you a more structured and shareable framework.',
    },
    footer: {
      pages: ['Buyers', 'Companies', 'PAC Experts', 'Registry', 'About', 'Legal'],
      links: ['/registry', '/register', '/agents', '/registry', '/registry', '/legal'],
    },
  },
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      '#f7f6f2',
  surface: '#f9f8f5',
  surface2:'#fbfbf9',
  offset:  '#f3f0ec',
  border:  'rgba(40,37,29,0.1)',
  text:    '#28251d',
  muted:   '#6e6a63',
  faint:   '#9b988f',
  primary: '#01696f',
  primaryH:'#0c4e54',
  inverse: '#f9f8f4',
  teal10:  'rgba(1,105,111,0.08)',
  teal20:  'rgba(1,105,111,0.18)',
  teal30:  'rgba(1,105,111,0.30)',
}

// ── DeepL helper ──────────────────────────────────────────────────────────────
// Used when user selects a language other than FR or EN.
// Results are cached in sessionStorage.
async function deeplTranslate(strings, targetLang) {
  const cacheKey = `mydd_tl_${targetLang}`
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* ignore */ }
  }
  try {
    const res = await fetch('/api/translate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: strings, target_lang: targetLang }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const translations = data.translations?.map(t => t.text) || null
    if (translations) sessionStorage.setItem(cacheKey, JSON.stringify(translations))
    return translations
  } catch {
    return null
  }
}

// ── Logo SVG ──────────────────────────────────────────────────────────────────
function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6" y="10" width="22" height="44" rx="8" stroke={T.primary} strokeWidth="4"/>
      <path d="M17 22L17 42" stroke={T.primary} strokeWidth="4" strokeLinecap="round"/>
      <path d="M36 18H44C52.837 18 60 25.163 60 34C60 42.837 52.837 50 44 50H36V18Z" stroke={T.primary} strokeWidth="4"/>
      <path d="M42 24H44C49.523 24 54 28.477 54 34C54 39.523 49.523 44 44 44H42" stroke={T.primary} strokeWidth="4" strokeLinecap="round"/>
    </svg>
  )
}

// ── Chevron ───────────────────────────────────────────────────────────────────
function Chevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Language picker ───────────────────────────────────────────────────────────
const LANGS = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'AR', label: 'العربية',  flag: '🇦🇪', deepl: true },
  { code: 'ES', label: 'Español',  flag: '🇪🇸', deepl: true },
  { code: 'PT', label: 'Português',flag: '🇧🇷', deepl: true },
  { code: 'ZH', label: '中文',     flag: '🇨🇳', deepl: true },
]

function LangPicker({ lang, setLang, setDeepl, loadingLang }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = LANGS.find(l => l.code === lang) || LANGS[0]

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const select = (l) => {
    setLang(l.code)
    if (l.deepl) setDeepl(true)
    else setDeepl(false)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: '999px', padding: '0.35rem 0.75rem', color: T.muted, cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', transition: 'border-color 0.2s' }} aria-label="Select language">
        <span>{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
        {loadingLang ? <span style={{ fontSize: '0.65rem' }}>⟳</span> : <Chevron open={open} />}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', zIndex: 999, minWidth: '170px', boxShadow: '0 8px 32px rgba(40,37,29,0.12)' }}>
          {LANGS.map(l => (
            <button key={l.code} onClick={() => select(l)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 1rem', background: l.code === lang ? T.teal10 : 'transparent', border: 'none', borderBottom: `1px solid ${T.border}`, color: l.code === lang ? T.primary : T.muted, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: '1.05rem' }}>{l.flag}</span>
              <span>{l.label}</span>
              {l.deepl && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: T.faint }}>DeepL</span>}
              {l.code === lang && <span style={{ marginLeft: 'auto', color: T.primary, fontSize: '0.7rem' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Checkmark list ────────────────────────────────────────────────────────────
function CheckList({ items, color = T.primary }) {
  return (
    <ul style={{ margin: '1rem 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', color: T.muted, fontSize: '0.95rem' }}>
          <span style={{ color, marginTop: '0.1rem', flexShrink: 0 }}>✓</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function Landing() {
  const [lang, setLang]         = useState('fr')
  const [usingDeepl, setDeepl]  = useState(false)
  const [loadingLang, setLoadingLang] = useState(false)
  const [deepLContent, setDeepLContent] = useState(null)
  const [certCount, setCertCount] = useState(null)
  const [menuOpen, setMenuOpen]   = useState(false)

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 640) setMenuOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Fetch live cert count for social proof
  useEffect(() => {
    fetch('/api/registry?limit=1')
      .then(r => r.json())
      .then(d => { if (typeof d?.pagination?.total === 'number') setCertCount(d.pagination.total) })
      .catch(() => {})
  }, [])

  // SEO meta
  useEffect(() => {
    const BASE = 'https://mydd.work'
    document.title = lang === 'fr'
      ? 'MyDD — Plateforme de vérification commerciale internationale'
      : 'MyDD — Structured commercial verification platform'
    const metas = [
      { name: 'description', content: lang === 'fr'
          ? 'MyDD est une plateforme privée de vérification commerciale opérée par B&E Consult FZCO. Vérification progressive, registre public, inspection terrain.'
          : 'MyDD is a private commercial verification platform operated by B&E Consult FZCO. Progressive verification, public registry, on-site inspection.' },
      { property: 'og:type',        content: 'website' },
      { property: 'og:url',         content: BASE },
      { property: 'og:title',       content: 'MyDD — B&E Consult FZCO' },
      { property: 'og:description', content: 'Private commercial verification platform. Bronze · Silver · Gold.' },
      { property: 'og:locale',      content: lang === 'fr' ? 'fr_FR' : 'en_US' },
    ]
    const added = metas.map(attrs => {
      const sel = attrs.property ? `meta[property="${attrs.property}"]` : `meta[name="${attrs.name}"]`
      const el = document.querySelector(sel) || document.createElement('meta')
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      if (!el.parentNode) document.head.appendChild(el)
      return el
    })
    return () => { added.forEach(el => { try { if (!el.getAttribute('data-static')) el.remove() } catch {} }) }
  }, [lang])

  // DeepL auto-translate when non-FR/EN language selected
  const getFlatStrings = useCallback(() => {
    const c = COPY.en
    return [
      c.nav.buyers, c.nav.companies, c.nav.pac, c.nav.legal, c.nav.cta,
      c.hero.eyebrow, c.hero.h1, c.hero.sub, c.hero.body, c.hero.cta1, c.hero.cta2, c.hero.cta3,
      c.deliverables.title, ...c.deliverables.items,
      c.problem.h2, c.problem.p,
      c.solution.h2, c.solution.p,
      ...c.audiences.map(a => a.title), ...c.audiences.map(a => a.desc),
      c.process.h2, c.process.sub, ...c.process.steps.map(s => s.title), ...c.process.steps.map(s => s.desc),
      c.levels.h2, c.levels.sub,
      ...c.levels.tiers.flatMap(t => [t.label, t.level, t.sub, ...t.items]),
      c.buyers.eyebrow, c.buyers.h2, c.buyers.p, ...c.buyers.items,
      c.companies.eyebrow, c.companies.h2, c.companies.p, ...c.companies.items,
      c.pac.eyebrow, c.pac.h2, c.pac.p, ...c.pac.path, ...c.pac.levels,
      c.legal.h2, c.legal.p, c.legal.notice,
      c.cta.h2, c.cta.p,
    ]
  }, [])

  useEffect(() => {
    if (!usingDeepl) { setDeepLContent(null); return }
    let cancelled = false
    setLoadingLang(true)
    deeplTranslate(getFlatStrings(), lang).then(results => {
      if (cancelled) return
      setDeepLContent(results)
      setLoadingLang(false)
    })
    return () => { cancelled = true }
  }, [lang, usingDeepl, getFlatStrings])

  // Choose content source
  const C = usingDeepl && deepLContent
    ? (() => {
        // Rebuild COPY-like structure from flat translated strings
        const t = deepLContent
        let i = 0
        const n = () => t[i++] ?? ''
        const arr = (count) => Array.from({ length: count }, () => n())
        const c = COPY.en
        return {
          nav: { buyers: n(), companies: n(), pac: n(), legal: n(), cta: n() },
          hero: { eyebrow: n(), h1: n(), sub: n(), body: n(), cta1: n(), cta2: n(), cta3: n() },
          deliverables: { title: n(), items: arr(c.deliverables.items.length) },
          problem: { h2: n(), p: n() },
          solution: { h2: n(), p: n() },
          audiences: c.audiences.map(() => ({ title: n(), desc: '' })).map((a, idx) => ({ ...a, desc: t[i - c.audiences.length + idx] ?? '' })),
          process: { h2: n(), sub: n(), steps: c.process.steps.map(() => ({ n: n(), title: n(), desc: '' })) },
          levels: { h2: n(), sub: n(), tiers: c.levels.tiers.map(tier => ({ ...tier, sub: n(), items: arr(tier.items.length) })) },
          buyers:    { eyebrow: n(), h2: n(), p: n(), items: arr(c.buyers.items.length) },
          companies: { eyebrow: n(), h2: n(), p: n(), items: arr(c.companies.items.length) },
          pac:    { eyebrow: n(), h2: n(), p: n(), path: arr(c.pac.path.length), levels: arr(c.pac.levels.length) },
          legal:  { h2: n(), p: n(), notice: n() },
          cta:    { h2: n(), p: n() },
          footer: COPY.en.footer,
        }
      })()
    : COPY[lang] || COPY.fr

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: { minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'General Sans', 'Inter', system-ui, sans-serif", overflowX: 'hidden' },
    header: { position: 'sticky', top: 0, zIndex: 50, background: `color-mix(in srgb, ${T.bg} 88%, transparent)`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${T.border}` },
    headerInner: { maxWidth: '1040px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', height: '64px' },
    brand: { display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: T.text },
    brandText: { fontWeight: '600', fontSize: '1.05rem', letterSpacing: '-0.01em' },
    brandSub: { fontSize: '0.72rem', color: T.muted, letterSpacing: '0.02em' },
    nav: { display: 'flex', gap: '1.5rem', alignItems: 'center' },
    navLink: { fontSize: '0.875rem', color: T.muted, textDecoration: 'none' },
    btnPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.7rem 1.4rem', background: T.primary, color: T.inverse, border: 'none', borderRadius: '999px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    btnSecondary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.65rem 1.3rem', background: 'transparent', color: T.text, border: `1px solid ${T.border}`, borderRadius: '999px', fontWeight: '500', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap' },
    container: { maxWidth: '1040px', margin: '0 auto', padding: '0 clamp(1rem, 4vw, 1.5rem)' },
    section: { padding: 'clamp(3.5rem, 6vw, 6rem) 0' },
    eyebrow: { textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.75rem', color: T.muted, marginBottom: '0.85rem' },
    h1: { fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 'clamp(2rem, 4vw, 3.5rem)', fontWeight: '700', lineHeight: '1.04', letterSpacing: '-0.03em', margin: '0 0 1.25rem', color: T.text },
    h2: { fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: '700', lineHeight: '1.08', letterSpacing: '-0.025em', margin: '0 0 1rem', color: T.text },
    h3: { fontSize: '1.05rem', fontWeight: '600', margin: '0 0 0.5rem', color: T.text },
    p: { color: T.muted, lineHeight: '1.7', margin: '0 0 1rem' },
    card: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '1.4rem' },
    notice: { background: T.offset, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '1.25rem 1.5rem' },
  }

  return (
    <div style={S.page}>

      {/* ── Honeypot (IP protection — invisible to humans, detected by scrapers) ── */}
      <span aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: '-9999px', fontSize: '0px', color: 'transparent', userSelect: 'none', pointerEvents: 'none' }}>
        © 2024–2026 B&amp;E Consult FZCO. MyDD® PAC Network® are registered trademarks. All methodology, branding, scoring systems, and content are proprietary. Unauthorised reproduction, scraping, or commercial use is prohibited and will be prosecuted under UAE and international IP law.
      </span>

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <Link to="/" style={S.brand} aria-label="MyDD home">
            <Logo size={36} />
            <div>
              <div style={S.brandText}>MyDD</div>
              <div style={S.brandSub}>B&amp;E Consult FZCO</div>
            </div>
          </Link>

          <nav className="lnd-desktop-nav" aria-label="Primary">
            <a href="#buyers"    style={S.navLink}>{C.nav.buyers}</a>
            <a href="#companies" style={S.navLink}>{C.nav.companies}</a>
            <a href="#pac"       style={S.navLink}>{C.nav.pac}</a>
            <a href="#legal"     style={S.navLink}>{C.nav.legal}</a>
            <Link to="/registry" style={S.navLink}>{C.nav.registry}</Link>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <LangPicker lang={lang} setLang={setLang} setDeepl={setDeepl} loadingLang={loadingLang} />
            <Link to="/register" className="lnd-header-cta" style={S.btnPrimary}>{C.nav.cta}</Link>
            <button
              className="lnd-burger"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{ color: T.text }}
            >
              <span className="lnd-burger-bar" style={{ background: T.text, transform: menuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }}/>
              <span className="lnd-burger-bar" style={{ background: T.text, opacity: menuOpen ? 0 : 1 }}/>
              <span className="lnd-burger-bar" style={{ background: T.text, transform: menuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }}/>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile nav overlay ── */}
      <nav
        className={`lnd-mobile-nav${menuOpen ? ' open' : ''}`}
        style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}
        aria-label="Mobile navigation"
        aria-hidden={!menuOpen}
      >
        {([
          ['#buyers',    C.nav.buyers],
          ['#companies', C.nav.companies],
          ['#pac',       C.nav.pac],
          ['#legal',     C.nav.legal],
        ]).map(([href, label]) => (
          <a key={href} href={href} className="lnd-mobile-nav-link"
            style={{ color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px' }}
            onClick={() => setMenuOpen(false)}
          >{label}</a>
        ))}
        <Link to="/registry" className="lnd-mobile-nav-link"
          style={{ color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px' }}
          onClick={() => setMenuOpen(false)}
        >{C.nav.registry}</Link>
        <Link to="/register" className="lnd-mobile-nav-link"
          style={{ background: T.primary, color: T.inverse, borderRadius: '10px', fontWeight: '600', textAlign: 'center', marginTop: '0.25rem' }}
          onClick={() => setMenuOpen(false)}
        >{C.nav.cta}</Link>
      </nav>

      <main id="content">

        {/* ── Hero ── */}
        <section style={{ padding: 'clamp(4rem, 8vw, 8rem) 0 3rem' }}>
          <div style={S.container} className="lnd-hero-grid">
            <div>
              <div style={S.eyebrow}>{C.hero.eyebrow}</div>
              <h1 style={S.h1}>{C.hero.h1}</h1>
              <p style={{ ...S.p, maxWidth: '58ch', fontSize: '1.05rem' }}>{C.hero.sub}</p>
              <p style={{ ...S.p, maxWidth: '58ch', fontSize: '0.92rem', color: T.faint }}>{C.hero.body}</p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                <Link to="/register" style={S.btnPrimary}>{C.hero.cta1}</Link>
                <Link to="/registry" style={S.btnSecondary}>{C.hero.cta2}</Link>
                <Link to="/register" style={{ ...S.btnSecondary, borderColor: T.teal20, color: T.primary }}>{C.hero.cta3}</Link>
              </div>
              {/* Live stat */}
              {certCount !== null && (
                <div style={{ marginTop: '2rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  {[
                    [certCount, lang === 'fr' ? 'Entreprises vérifiées' : 'Verified companies'],
                    ['3', lang === 'fr' ? 'Niveaux de vérification' : 'Verification levels'],
                    ['5–21j', lang === 'fr' ? 'Délai de traitement' : 'Processing time'],
                  ].map(([val, label], i) => (
                    <div key={i} style={{ borderTop: `1px solid ${T.border}`, paddingTop: '0.75rem' }}>
                      <strong style={{ display: 'block', fontSize: '1.3rem', fontWeight: '700', color: T.primary }}>{val}</strong>
                      <span style={{ fontSize: '0.78rem', color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hero card */}
            <aside style={{ background: `linear-gradient(180deg, ${T.surface}, ${T.offset})`, border: `1px solid ${T.border}`, borderRadius: '18px', padding: '1.75rem', boxShadow: '0 8px 32px rgba(40,37,29,0.07)' }}>
              <p style={{ ...S.p, marginBottom: '1rem', fontSize: '0.9rem' }}>
                {lang === 'fr'
                  ? 'Opéré par B&E Consult FZCO, MyDD est conçu pour améliorer la lisibilité d\'un dossier commercial en environnement cross-border.'
                  : 'Operated by B&E Consult FZCO, MyDD is designed to improve the readability of a commercial file in cross-border environments.'}
              </p>
              <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '1rem' }}>
                <strong style={{ fontSize: '0.85rem', color: T.text }}>{C.deliverables.title}</strong>
                <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1.1rem', color: T.muted, fontSize: '0.875rem', lineHeight: '1.8' }}>
                  {C.deliverables.items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
              {/* Certification badges */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                {['Bronze', 'Silver', 'Gold'].map(l => (
                  <span key={l} style={{ padding: '0.3rem 0.75rem', background: T.teal10, border: `1px solid ${T.teal20}`, borderRadius: '999px', fontSize: '0.72rem', fontWeight: '600', color: T.primary, letterSpacing: '0.05em' }}>
                    {l}
                  </span>
                ))}
              </div>
            </aside>
          </div>
        </section>

        {/* ── Problem ── */}
        <section id="problem" style={S.section}>
          <div style={S.container} className="lnd-split-80-20">
            <div><h2 style={S.h2}>{C.problem.h2}</h2></div>
            <div>
              <p style={{ ...S.p, fontSize: '1rem' }}>{C.problem.p}</p>
              <p style={{ ...S.p, fontSize: '1rem' }}>{C.solution.p}</p>
            </div>
          </div>
          {/* Audience cards */}
          <div style={{ ...S.container, marginTop: '2rem' }} className="lnd-grid-4">
            {C.audiences.map((a, i) => (
              <article key={i} style={S.card}>
                <h3 style={S.h3}>{a.title}</h3>
                <p style={{ ...S.p, fontSize: '0.875rem', margin: 0 }}>{a.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Process ── */}
        <section id="process" style={{ ...S.section, background: T.surface }}>
          <div style={S.container}>
            <div style={{ marginBottom: '2rem' }} className="lnd-split-80-20">
              <h2 style={S.h2}>{C.process.h2}</h2>
              <p style={{ ...S.p, alignSelf: 'end' }}>{C.process.sub}</p>
            </div>
            <div className="lnd-grid-4">
              {C.process.steps.map((step, i) => (
                <div key={i} style={{ padding: '1.4rem', borderTop: `2px solid ${T.primary}`, background: T.surface2, borderRadius: '14px' }}>
                  <small style={{ color: T.faint, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.72rem' }}>{step.n}</small>
                  <h3 style={{ ...S.h3, marginTop: '0.5rem' }}>{step.title}</h3>
                  <p style={{ ...S.p, fontSize: '0.875rem', margin: 0 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Levels ── */}
        <section id="levels" style={S.section}>
          <div style={S.container}>
            <div style={{ marginBottom: '2rem' }} className="lnd-split-80-20">
              <h2 style={S.h2}>{C.levels.h2}</h2>
              <p style={{ ...S.p, alignSelf: 'end', fontSize: '0.92rem' }}>{C.levels.sub}</p>
            </div>
            <div className="lnd-grid-3">
              {C.levels.tiers.map((tier, i) => (
                <article key={i} style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: '1rem', ...(tier.featured ? { background: `linear-gradient(180deg, ${T.teal10}, ${T.surface})`, borderColor: T.teal30 } : {}) }}>
                  <div>
                    <div style={{ ...S.eyebrow, marginBottom: '0.3rem' }}>{tier.label}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '700', color: T.text }}>{tier.level}</div>
                  </div>
                  <p style={{ ...S.p, fontSize: '0.875rem', margin: 0 }}>{tier.sub}</p>
                  <ul style={{ paddingLeft: '1.1rem', margin: 0, color: T.muted, fontSize: '0.875rem', lineHeight: '1.85' }}>
                    {tier.items.map((item, j) => <li key={j}>{item}</li>)}
                  </ul>
                  {tier.featured && (
                    <Link to="/register" style={{ ...S.btnPrimary, marginTop: 'auto', justifyContent: 'center' }}>
                      {lang === 'fr' ? 'Commencer' : 'Get started'}
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Buyers + Companies ── */}
        <section id="buyers" style={{ ...S.section, background: T.surface }}>
          <div style={S.container} className="lnd-grid-2">
            {/* Buyers */}
            <article style={S.card}>
              <div style={S.eyebrow}>{C.buyers.eyebrow}</div>
              <h2 style={{ ...S.h2, fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)' }}>{C.buyers.h2}</h2>
              <p style={{ ...S.p, fontSize: '0.92rem' }}>{C.buyers.p}</p>
              <CheckList items={C.buyers.items} />
              <div style={{ marginTop: '1.5rem' }}>
                <Link to="/registry" style={S.btnPrimary}>{C.nav.registry} →</Link>
              </div>
            </article>

            {/* Companies */}
            <article id="companies" style={S.card}>
              <div style={S.eyebrow}>{C.companies.eyebrow}</div>
              <h2 style={{ ...S.h2, fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)' }}>{C.companies.h2}</h2>
              <p style={{ ...S.p, fontSize: '0.92rem' }}>{C.companies.p}</p>
              <CheckList items={C.companies.items} />
              <div style={{ marginTop: '1.5rem' }}>
                <Link to="/register" style={S.btnPrimary}>{lang === 'fr' ? 'Se certifier' : 'Get certified'} →</Link>
              </div>
            </article>
          </div>
        </section>

        {/* ── PAC ── */}
        <section id="pac" style={S.section}>
          <div style={S.container}>
            <div className="lnd-pac-grid">
              <div>
                <div style={S.eyebrow}>{C.pac.eyebrow}</div>
                <h2 style={S.h2}>{C.pac.h2}</h2>
                <p style={{ ...S.p, fontSize: '0.95rem' }}>{C.pac.p}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem' }}>
                  {C.pac.levels.map((l, i) => (
                    <span key={i} style={{ padding: '0.3rem 0.85rem', background: T.teal10, border: `1px solid ${T.teal20}`, borderRadius: '999px', fontSize: '0.8rem', fontWeight: '600', color: T.primary }}>
                      {l}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: '1.5rem' }}>
                  <Link to="/agents" style={S.btnPrimary}>{lang === 'fr' ? 'Voir les experts PAC' : 'Browse PAC experts'} →</Link>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {C.pac.path.map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 1rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px' }}>
                    <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: T.teal10, border: `1px solid ${T.teal20}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700', color: T.primary, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: '0.9rem', color: T.text }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Legal framework ── */}
        <section id="legal" style={{ ...S.section, background: T.surface }}>
          <div style={S.container}>
            <div className="lnd-legal-grid">
              <h2 style={S.h2}>{C.legal.h2}</h2>
              <div>
                <p style={{ ...S.p, fontSize: '0.95rem' }}>{C.legal.p}</p>
                <div style={S.notice}>
                  <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem', color: T.text }}>
                    {lang === 'fr' ? 'Important' : 'Important'}
                  </strong>
                  <p style={{ ...S.p, fontSize: '0.875rem', margin: 0 }}>{C.legal.notice}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA band ── */}
        <section id="cta" style={S.section}>
          <div style={S.container}>
            <div style={{ padding: 'clamp(1.5rem, 4vw, 3rem)', borderRadius: '20px', background: `linear-gradient(150deg, ${T.primary}, #0c4e54)`, color: T.inverse }} className="lnd-cta-grid">
              <div>
                <h2 style={{ fontFamily: "'Georgia', serif", fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', fontWeight: '700', lineHeight: '1.15', letterSpacing: '-0.025em', margin: '0 0 0.75rem', color: T.inverse }}>
                  {C.cta.h2}
                </h2>
                <p style={{ color: 'rgba(249,248,244,0.75)', fontSize: '0.95rem', lineHeight: '1.65', margin: 0 }}>{C.cta.p}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
                <a href="mailto:legal@mydd.work" style={{ ...S.btnSecondary, background: 'white', color: '#0f3638', borderColor: 'white' }}>
                  legal@mydd.work
                </a>
                <a href="#top" style={{ ...S.btnSecondary, color: T.inverse, borderColor: 'rgba(255,255,255,0.3)' }}>
                  {lang === 'fr' ? 'Retour en haut ↑' : 'Back to top ↑'}
                </a>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer style={{ padding: '2rem 0 4rem', borderTop: `1px solid ${T.border}` }}>
        <div style={S.container} className="lnd-footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <Logo size={28} />
              <strong style={{ fontSize: '0.95rem' }}>MyDD</strong>
            </div>
            <div style={{ color: T.muted, fontSize: '0.8rem', lineHeight: '1.6' }}>
              B&amp;E Consult FZCO — Dubai, UAE<br />
              <a href="mailto:support@mydd.work" style={{ color: T.muted, textDecoration: 'none' }}>support@mydd.work</a>
              {' · '}
              <a href="mailto:legal@mydd.work" style={{ color: T.muted, textDecoration: 'none' }}>legal@mydd.work</a>
            </div>
            <div style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}>
              <Link to="/support" style={{ color: T.muted, textDecoration: 'none' }}>Support &amp; Contact</Link>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: T.faint }}>
              © {new Date().getFullYear()} B&amp;E Consult FZCO. MyDD® PAC Network® are registered trademarks.{' '}
              <Link to="/legal" style={{ color: T.faint }}>Legal &amp; Disclaimer</Link>
            </div>
          </div>
          <nav className="lnd-footer-nav">
            {C.footer.pages.map((page, i) => (
              <Link key={i} to={C.footer.links[i]} style={{ fontSize: '0.85rem', color: T.muted, textDecoration: 'none' }}>
                {page}
              </Link>
            ))}
          </nav>
        </div>
      </footer>

      {/* Structured data — IP + SEO */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'MyDD by B&E Consult FZCO',
        url: 'https://mydd.work',
        logo: 'https://mydd.work/favicon.svg',
        description: 'Private commercial verification platform. Bronze · Silver · Gold certification levels.',
        foundingDate: '2024',
        legalName: 'B&E Consult FZCO',
        address: { '@type': 'PostalAddress', addressLocality: 'Dubai', addressCountry: 'AE' },
        contactPoint: { '@type': 'ContactPoint', email: 'support@mydd.work', contactType: 'customer service' },
        sameAs: ['https://mydd.work/registry', 'https://mydd.work/agents'],
        copyrightHolder: { '@type': 'Organization', name: 'B&E Consult FZCO' },
        copyrightYear: new Date().getFullYear(),
      })}} />

    </div>
  )
}
