import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.json'
import fr from './locales/fr.json'
import ar from './locales/ar.json'
import zh from './locales/zh.json'
import es from './locales/es.json'
import pt from './locales/pt.json'

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇦🇪', dir: 'rtl' },
  { code: 'zh', label: '中文', flag: '🇨🇳', dir: 'ltr' },
  { code: 'es', label: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'pt', label: 'Português', flag: '🇧🇷', dir: 'ltr' },
]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, fr: { translation: fr }, ar: { translation: ar }, zh: { translation: zh }, es: { translation: es }, pt: { translation: pt } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'ar', 'zh', 'es', 'pt'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'mydd_lang',
    },
    interpolation: { escapeValue: false },
  })

// Apply RTL direction on language change
const applyDir = (lang) => {
  const langDef = LANGUAGES.find((l) => l.code === lang)
  document.documentElement.setAttribute('dir', langDef?.dir || 'ltr')
  document.documentElement.setAttribute('lang', lang)
}

applyDir(i18n.language)
i18n.on('languageChanged', applyDir)

export default i18n
