import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN

/**
 * Initialise Sentry — called once from main.jsx.
 * No-ops safely when DSN is absent (local dev / staging without DSN set).
 */
export function initSentry () {
  if (!DSN) return

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,          // 'production' | 'staging' | 'development'
    release: import.meta.env.VITE_APP_VERSION,  // optional — set in Railway vars

    // Capture 10 % of sessions for performance traces in prod
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,

    // Replay: 1 % of sessions normally, 100 % on error
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Don't clutter Sentry with noise from local dev
    beforeSend (event) {
      if (import.meta.env.DEV) return null
      return event
    },
  })
}

export { Sentry }
