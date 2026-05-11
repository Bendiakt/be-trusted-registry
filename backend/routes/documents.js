'use strict'
// Document upload / management route.
// Storage backends (auto-detected from env vars):
//   • Cloudflare R2 (S3-compatible): set R2_BUCKET_NAME, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//   • Local disk (default / fallback): UPLOAD_DIR env var or ./uploads/
//
// Endpoints:
//   POST   /api/documents/upload           — authenticated company user, multipart
//   GET    /api/documents                  — list own company's documents
//   GET    /api/documents/:id/file         — serve file (own or admin)
//   DELETE /api/documents/:id              — delete own pending document
//   GET    /api/documents/admin/:companyId — admin: list docs for a company
//   PATCH  /api/documents/admin/:id/review — admin: approve / reject a doc

const path       = require('path')
const fs         = require('fs')
const express    = require('express')
const rateLimit  = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')
const router     = express.Router()
const { query }  = require('../db')

// ── Upload rate-limit: 20 files per 15 min per user ───────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `upload:${ipKeyGenerator(req)}:${req.user?.id || 'anon'}`,
  message: { error: 'Too many uploads. Try again later.' },
})

// ── Multer setup (always writes to local temp dir first) ──────────────────────
let multer
try { multer = require('multer') } catch {
  router.use(() => null)
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

const diskStorage = multer
  ? multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (_req, file, cb) => {
        const ext  = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8)
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`
        cb(null, name)
      },
    })
  : null

const upload = multer
  ? multer({
      storage: diskStorage,
      limits: { fileSize: MAX_SIZE, files: 5 },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true)
        cb(new Error('File type not allowed'))
      },
    })
  : null

const notInstalled = (_req, res) => res.status(503).json({ error: 'multer not installed — run npm install in backend' })

// ── Cloudflare R2 (S3-compatible) storage backend — optional ─────────────────
// Activated when R2_BUCKET_NAME + R2_ENDPOINT + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY are set.
// Falls back to local disk otherwise.

const R2_BUCKET   = process.env.R2_BUCKET_NAME
const R2_ENDPOINT = process.env.R2_ENDPOINT        // e.g. https://<account-id>.r2.cloudflarestorage.com
const R2_KEY_ID   = process.env.R2_ACCESS_KEY_ID
const R2_SECRET   = process.env.R2_SECRET_ACCESS_KEY
const R2_PUB_URL  = process.env.R2_PUBLIC_URL      // optional: public bucket base URL for serving

const useR2 = Boolean(R2_BUCKET && R2_ENDPOINT && R2_KEY_ID && R2_SECRET)

let S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand
if (useR2) {
  try {
    ;({ S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3'))
    console.log(JSON.stringify({ event: 'storage.r2.active', bucket: R2_BUCKET }))
  } catch {
    console.warn('R2 env vars set but @aws-sdk/client-s3 not installed — falling back to local disk. Run: npm install @aws-sdk/client-s3')
  }
}

const r2Client = (useR2 && S3Client)
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_KEY_ID, secretAccessKey: R2_SECRET },
    })
  : null

/**
 * Persist a multer temp file to the active storage backend.
 * Returns { storagePath, storageKey } — storagePath is what gets stored in DB.
 *   - Local:  storagePath = absolute filesystem path
 *   - R2:     storagePath = r2:<key>  (prefix marks it as remote)
 */
const storeFile = async (file) => {
  const key = `documents/${file.filename}`

  if (r2Client) {
    const body = fs.createReadStream(file.path)
    await r2Client.send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         key,
      Body:        body,
      ContentType: file.mimetype,
    }))
    // Clean up the temp file after upload
    try { fs.unlinkSync(file.path) } catch { /* already gone */ }
    return { storagePath: `r2:${key}`, storageKey: key }
  }

  // Local disk — file is already in UPLOAD_DIR
  return { storagePath: file.path, storageKey: null }
}

/**
 * Delete a file from the active storage backend.
 * storagePath is the value stored in the DB.
 */
const deleteFile = async (storagePath) => {
  if (storagePath.startsWith('r2:') && r2Client) {
    const key = storagePath.slice(3)
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {})
  } else {
    try { fs.unlinkSync(storagePath) } catch { /* already gone */ }
  }
}

/**
 * Stream a file to the HTTP response.
 * storagePath is the value stored in the DB.
 */
const serveFile = async (doc, res) => {
  res.setHeader('Content-Type', doc.mime_type)
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`)

  if (doc.storage_path.startsWith('r2:') && r2Client) {
    if (R2_PUB_URL) {
      // Public bucket — redirect to CDN URL
      const key = doc.storage_path.slice(3)
      return res.redirect(302, `${R2_PUB_URL}/${key}`)
    }
    // Private bucket — stream via presigned-equivalent GetObject
    const key = doc.storage_path.slice(3)
    const response = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return response.Body.pipe(res)
  }

  // Local disk
  if (!fs.existsSync(doc.storage_path)) return res.status(404).json({ error: 'File not found on disk' })
  fs.createReadStream(doc.storage_path).pipe(res)
}

// ── POST /api/documents/upload ────────────────────────────────────────────────
router.post('/upload', uploadLimiter, upload ? upload.array('files', 5) : notInstalled, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' })

  try {
    const companyResult = await query('SELECT id FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    if (!companyResult.rows.length) return res.status(400).json({ error: 'Register your company first' })
    const companyId = companyResult.rows[0].id
    const docType   = String(req.body.docType || 'general').replace(/[^a-z_]/g, '').slice(0, 50)

    const inserted = []
    for (const file of req.files) {
      const { storagePath } = await storeFile(file)
      const result = await query(
        `INSERT INTO documents (company_id, user_id, file_name, original_name, mime_type, size_bytes, storage_path, doc_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, original_name, mime_type, size_bytes, doc_type, status, uploaded_at`,
        [companyId, req.user.id, file.filename, file.originalname, file.mimetype, file.size, storagePath, docType]
      )
      inserted.push(result.rows[0])
    }
    res.json({ documents: inserted, storage: useR2 && r2Client ? 'r2' : 'local' })
  } catch (err) {
    console.error('Document upload error:', err.message)
    res.status(500).json({ error: 'Upload failed' })
  }
})

// ── GET /api/documents — list own documents ───────────────────────────────────
router.get('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const companyResult = await query('SELECT id FROM companies WHERE user_id = $1 LIMIT 1', [req.user.id])
    if (!companyResult.rows.length) return res.json({ documents: [] })
    const result = await query(
      `SELECT id, original_name, mime_type, size_bytes, doc_type, status, review_note, uploaded_at
         FROM documents WHERE company_id = $1 ORDER BY uploaded_at DESC`,
      [companyResult.rows[0].id]
    )
    res.json({ documents: result.rows })
  } catch (err) {
    console.error('List docs error:', err.message)
    res.status(500).json({ error: 'Failed to load documents' })
  }
})

// ── GET /api/documents/:id/file — serve file (own or admin) ──────────────────
router.get('/:id/file', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const docId = parseInt(req.params.id, 10)
  if (isNaN(docId)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const result = await query(
      `SELECT d.*, c.user_id AS owner_user_id
         FROM documents d
         JOIN companies c ON c.id = d.company_id
        WHERE d.id = $1 LIMIT 1`,
      [docId]
    )
    const doc = result.rows[0]
    if (!doc) return res.status(404).json({ error: 'Not found' })
    if (req.user.role !== 'admin' && doc.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    await serveFile(doc, res)
  } catch (err) {
    console.error('File serve error:', err.message)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to serve file' })
  }
})

// ── DELETE /api/documents/:id — delete own pending document ──────────────────
router.delete('/:id', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  const docId = parseInt(req.params.id, 10)
  if (isNaN(docId)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const result = await query(
      `DELETE FROM documents WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id, storage_path`,
      [docId, req.user.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found or cannot delete reviewed document' })
    await deleteFile(result.rows[0].storage_path)
    res.json({ deleted: true })
  } catch (err) {
    console.error('Delete doc error:', err.message)
    res.status(500).json({ error: 'Delete failed' })
  }
})

// ── GET /api/documents/admin/:companyId ───────────────────────────────────────
router.get('/admin/:companyId', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
  const companyId = parseInt(req.params.companyId, 10)
  if (isNaN(companyId)) return res.status(400).json({ error: 'Invalid company id' })
  try {
    const result = await query(
      `SELECT d.id, d.original_name, d.mime_type, d.size_bytes, d.doc_type, d.status,
              d.review_note, d.uploaded_at, d.reviewed_at,
              u.name AS reviewer_name
         FROM documents d
         LEFT JOIN users u ON u.id = d.reviewed_by
        WHERE d.company_id = $1
        ORDER BY d.uploaded_at DESC`,
      [companyId]
    )
    res.json({ documents: result.rows })
  } catch (err) {
    console.error('Admin list docs error:', err.message)
    res.status(500).json({ error: 'Failed to load documents' })
  }
})

// ── PATCH /api/documents/admin/:id/review — approve or reject ────────────────
router.patch('/admin/:id/review', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
  const docId = parseInt(req.params.id, 10)
  if (isNaN(docId)) return res.status(400).json({ error: 'Invalid id' })
  const { status, note } = req.body
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be approved or rejected' })
  try {
    const result = await query(
      `UPDATE documents
          SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = NOW()
        WHERE id = $4
       RETURNING id, status, review_note`,
      [status, String(note || '').slice(0, 1000), req.user.id, docId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' })
    res.json({ document: result.rows[0] })
  } catch (err) {
    console.error('Review doc error:', err.message)
    res.status(500).json({ error: 'Review failed' })
  }
})

module.exports = router
