import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import CookieBanner from './components/CookieBanner.jsx'
import { initSentry } from './lib/sentry.js'
import './i18n'
import './index.css'

// Initialise Sentry before rendering — no-ops if VITE_SENTRY_DSN is not set
initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <CookieBanner />
    </ErrorBoundary>
  </StrictMode>
)
