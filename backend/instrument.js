const Sentry = require('@sentry/node')

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'production',
  })
}
