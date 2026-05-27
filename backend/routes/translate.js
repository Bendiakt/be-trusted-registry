'use strict'
/**
 * routes/translate.js — DeepL translation proxy
 *
 * POST /api/translate
 * Body: { text: string | string[], target_lang: string, source_lang?: string }
 * Returns: { translations: [{ detected_source_language, text }] }
 *
 * Proxies to DeepL Free or Pro API depending on DEEPL_API_KEY suffix.
 * The key is never exposed to the client — all requests go through this endpoint.
 *
 * Rate-limited: 30 req/min per IP to prevent abuse of the DeepL quota.
 */

const express     = require('express')
const https       = require('https')
const { makeRateLimiter } = require('../lib/rateLimiter')
const router      = express.Router()

const DEEPL_KEY   = process.env.DEEPL_API_KEY || ''
// DeepL Free keys end with ':fx', Pro keys don't
const DEEPL_URL   = DEEPL_KEY.endsWith(':fx')
  ? 'api-free.deepl.com'
  : 'api.deepl.com'

const translateLimiter = makeRateLimiter({
  _prefix:  'rl:translate:',
  windowMs: 60 * 1000,
  max:      30,
  message:  { error: 'Translation rate limit exceeded. Try again in a moment.' },
})

// Supported DeepL target language codes
const SUPPORTED_LANGS = new Set([
  'AR','BG','CS','DA','DE','EL','EN','EN-GB','EN-US',
  'ES','ET','FI','FR','HU','ID','IT','JA','KO','LT','LV',
  'NB','NL','PL','PT','PT-BR','PT-PT','RO','RU','SK','SL',
  'SV','TR','UK','ZH',
])

/**
 * POST /api/translate
 * Public endpoint — no auth required (landing page needs it without login).
 */
router.post('/', translateLimiter, async (req, res) => {
  if (!DEEPL_KEY) {
    return res.status(503).json({ error: 'Translation service not configured.' })
  }

  const { text, target_lang, source_lang } = req.body || {}

  if (!text || !target_lang) {
    return res.status(400).json({ error: 'text and target_lang are required.' })
  }

  const lang = String(target_lang).toUpperCase()
  if (!SUPPORTED_LANGS.has(lang)) {
    return res.status(400).json({ error: `Unsupported target language: ${target_lang}` })
  }

  const texts = Array.isArray(text) ? text : [String(text)]
  if (texts.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 strings per request.' })
  }
  if (texts.some(t => String(t).length > 5000)) {
    return res.status(400).json({ error: 'Maximum 5000 characters per string.' })
  }

  // Build DeepL request body
  const params = new URLSearchParams()
  texts.forEach(t => params.append('text', t))
  params.set('target_lang', lang)
  if (source_lang) params.set('source_lang', String(source_lang).toUpperCase())
  params.set('tag_handling', 'html') // preserve HTML tags in content

  const body = params.toString()

  const options = {
    hostname: DEEPL_URL,
    path:     '/v2/translate',
    method:   'POST',
    headers:  {
      'Authorization': `DeepL-Auth-Key ${DEEPL_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent':     'MyDD/1.0',
    },
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const req2 = https.request(options, (r2) => {
        let data = ''
        r2.on('data', chunk => { data += chunk })
        r2.on('end', () => {
          if (r2.statusCode !== 200) {
            return reject(new Error(`DeepL returned ${r2.statusCode}: ${data}`))
          }
          try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid DeepL response')) }
        })
      })
      req2.on('error', reject)
      req2.setTimeout(8000, () => { req2.destroy(); reject(new Error('DeepL timeout')) })
      req2.write(body)
      req2.end()
    })

    res.json({ translations: result.translations })
  } catch (err) {
    console.error(JSON.stringify({ event: 'translate.error', err: err.message }))
    res.status(502).json({ error: 'Translation service unavailable. Please try again.' })
  }
})

module.exports = router
