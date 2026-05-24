/**
 * i18n parity test — ensures all 6 locale files stay in sync.
 *
 * Rules enforced:
 *  1. Every key present in en.json must exist in every other locale.
 *  2. No locale may have keys that en.json lacks (drift detection).
 *  3. No locale file may contain empty-string values (untranslated slots).
 *
 * Run automatically in CI (frontend-tests job). Add a key to en.json
 * and this test will fail until the other locales are updated.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dir, '..', 'locales')
const LANGUAGES = ['en', 'fr', 'es', 'pt', 'ar', 'zh']

// ── Helpers ───────────────────────────────────────────────────────────────────

const loadLocale = (lang) =>
  JSON.parse(readFileSync(join(LOCALES_DIR, `${lang}.json`), 'utf8'))

const flattenKeys = (obj, prefix = '') => {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object') {
      keys.push(...flattenKeys(v, key))
    } else {
      keys.push(key)
    }
  }
  return keys
}

const flattenEntries = (obj, prefix = '') => {
  const entries = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object') {
      Object.assign(entries, flattenEntries(v, key))
    } else {
      entries[key] = v
    }
  }
  return entries
}

// Load all locales once
const locales = Object.fromEntries(LANGUAGES.map((l) => [l, loadLocale(l)]))
const enKeys  = new Set(flattenKeys(locales.en))
const enCount = enKeys.size

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('i18n parity — all locales in sync with en.json', () => {

  it('en.json has at least 395 keys (sanity check)', () => {
    expect(enCount).toBeGreaterThanOrEqual(395)
  })

  for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
    const langKeys = new Set(flattenKeys(locales[lang]))

    it(`${lang}.json contains every key from en.json`, () => {
      const missing = [...enKeys].filter((k) => !langKeys.has(k))
      expect(missing, `Missing keys in ${lang}: ${missing.slice(0, 10).join(', ')}`).toHaveLength(0)
    })

    it(`${lang}.json has no extra keys absent from en.json`, () => {
      const extra = [...langKeys].filter((k) => !enKeys.has(k))
      expect(extra, `Extra keys in ${lang} not in en: ${extra.slice(0, 10).join(', ')}`).toHaveLength(0)
    })

    it(`${lang}.json has no empty-string values (untranslated slots)`, () => {
      const entries = flattenEntries(locales[lang])
      const empty = Object.entries(entries)
        .filter(([, v]) => v === '')
        .map(([k]) => k)
      expect(empty, `Empty values in ${lang}: ${empty.slice(0, 5).join(', ')}`).toHaveLength(0)
    })
  }

  it('all locale files have identical key counts', () => {
    const counts = LANGUAGES.map((l) => ({
      lang: l,
      count: flattenKeys(locales[l]).length,
    }))
    const unique = new Set(counts.map((c) => c.count))
    const summary = counts.map((c) => `${c.lang}:${c.count}`).join(' ')
    expect(unique.size, `Key count mismatch: ${summary}`).toBe(1)
  })
})
