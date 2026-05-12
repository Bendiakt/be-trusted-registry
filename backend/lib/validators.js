'use strict'
/**
 * lib/validators.js — Zod schemas + Express middleware factory.
 *
 * Usage:
 *   const { validate, schemas } = require('../lib/validators')
 *   router.post('/register', validate(schemas.register), handler)
 *
 * validate() returns a middleware that:
 *   - Parses req.body against the schema with safeParse()
 *   - On failure → 400 JSON with structured errors (field + message)
 *   - On success  → replaces req.body with the parsed (coerced + stripped) data
 */

const { z } = require('zod')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Trims strings and converts empty-string to undefined so .optional() works. */
const str   = (max = 1000) => z.string().trim().max(max)
const email = () => z.string().trim().toLowerCase().email('Invalid email address').max(254)
const url   = () => z.string().trim().url('Invalid URL').max(2048).optional().or(z.literal(''))

/** Allowed certification levels */
const CERT_LEVELS  = [0, 1, 2, 3]
/** Allowed company statuses set by admin */
const COMPANY_STATUSES = ['active', 'suspended', 'pending']
/** Allowed mission outcomes */
const MISSION_OUTCOMES = ['pass', 'fail', 'inconclusive']
/** Allowed roles for registration */
const REGISTER_ROLES = ['company', 'pac', 'trader']

// ── Schemas ───────────────────────────────────────────────────────────────────

const schemas = {

  // ── Auth ──────────────────────────────────────────────────────────────────

  /** POST /api/auth/register */
  register: z.object({
    name:     str(100).min(2, 'Name must be at least 2 characters'),
    email:    email(),
    password: str(128).min(8, 'Password must be at least 8 characters'),
    role:     z.enum(REGISTER_ROLES, { errorMap: () => ({ message: `Role must be one of: ${REGISTER_ROLES.join(', ')}` }) })
               .default('company'),
  }),

  /** POST /api/auth/login */
  login: z.object({
    email:    email(),
    password: str(128).min(1, 'Password required'),
  }),

  /** POST /api/auth/forgot-password */
  forgotPassword: z.object({
    email: email(),
  }),

  /** POST /api/auth/reset-password */
  resetPassword: z.object({
    token:    str(512).min(1, 'Reset token required'),
    password: str(128).min(8, 'Password must be at least 8 characters'),
  }),

  /** POST /api/auth/resend-verify */
  resendVerify: z.object({
    email: email(),
  }),

  /** PATCH /api/auth/profile */
  updateProfile: z.object({
    name:            str(100).min(2, 'Name must be at least 2 characters').optional(),
    currentPassword: str(128).optional(),
    newPassword:     str(128).min(8, 'New password must be at least 8 characters').optional(),
  }).refine(
    (d) => !(d.newPassword && !d.currentPassword),
    { message: 'currentPassword is required when setting a new password', path: ['currentPassword'] }
  ),

  // ── Companies ─────────────────────────────────────────────────────────────

  /** POST /api/companies (onboarding) */
  createCompany: z.object({
    name:        str(200).min(2, 'Company name must be at least 2 characters'),
    industry:    str(100).optional(),
    sector:      str(100).optional(),
    country:     str(100).min(2, 'Country required'),
    description: str(2000).optional(),
    website:     url(),
  }),

  /** PATCH /api/companies/me */
  updateCompany: z.object({
    companyName: str(200).min(2, 'Company name must be at least 2 characters').optional(),
    country:     str(100).optional(),
    sector:      str(100).optional(),
    website:     url(),
  }),

  // ── Admin ─────────────────────────────────────────────────────────────────

  /** PATCH /api/admin/users/:id/role */
  assignRole: z.object({
    role: z.enum(['company', 'pac', 'trader', 'admin'], {
      errorMap: () => ({ message: 'Role must be one of: company, pac, trader, admin' }),
    }),
  }),

  /** PATCH /api/admin/companies/:id/certify */
  certifyCompany: z.object({
    level: z.coerce.number().int().refine(
      (v) => CERT_LEVELS.includes(v),
      { message: `Certification level must be one of: ${CERT_LEVELS.join(', ')}` }
    ),
  }),

  /** POST /api/admin/companies/:id/suspend */
  suspendCompany: z.object({
    suspend: z.boolean({ required_error: 'suspend (boolean) required' }),
    reason:  str(500).optional(),
  }),

  /** PATCH /api/admin/companies/:id/status */
  updateCompanyStatus: z.object({
    status: z.enum(COMPANY_STATUSES, {
      errorMap: () => ({ message: `Status must be one of: ${COMPANY_STATUSES.join(', ')}` }),
    }),
  }),

  // ── PAC ───────────────────────────────────────────────────────────────────

  /** PATCH /api/pac/profile */
  updatePacProfile: z.object({
    name:             str(100).min(2, 'Name must be at least 2 characters').optional(),
    location:         str(200).optional(),
    languages:        z.array(str(50)).max(20).optional(),
    certifications:   z.array(str(200)).max(20).optional(),
    bio:              str(2000).optional(),
  }),

  /** POST /api/pac/missions/:id/report */
  submitMissionReport: z.object({
    report_text: str(10000).min(10, 'Report must be at least 10 characters'),
    outcome:     z.enum(MISSION_OUTCOMES, {
      errorMap: () => ({ message: `Outcome must be one of: ${MISSION_OUTCOMES.join(', ')}` }),
    }),
  }),

  // ── 2FA TOTP ──────────────────────────────────────────────────────────────

  /** POST /api/auth/2fa/verify — verify TOTP code and activate 2FA */
  totpVerify: z.object({
    token: str(6).regex(/^\d{6}$/, 'TOTP token must be exactly 6 digits'),
  }),

  /** POST /api/auth/2fa/validate — validate TOTP during login (step 2) */
  totpValidate: z.object({
    tempToken: str(128).min(1, 'Temp token required'),
    token:     str(6).regex(/^\d{6}$/, 'TOTP token must be exactly 6 digits'),
  }),

  /** POST /api/auth/2fa/disable — disable 2FA (requires password confirmation) */
  totpDisable: z.object({
    password: str(128).min(1, 'Password required'),
    token:    str(6).regex(/^\d{6}$/, 'TOTP token must be exactly 6 digits'),
  }),

  // ── Documents ─────────────────────────────────────────────────────────────

  /** POST /api/documents/upload (metadata only — file handled by multer) */
  uploadDocument: z.object({
    type: str(100).optional(),
    note: str(500).optional(),
  }),
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * validate(schema) — Express middleware.
 * Validates req.body against the Zod schema.
 * On success: replaces req.body with the parsed/stripped value.
 * On failure: returns 400 with structured error array.
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field:   e.path.join('.') || 'body',
      message: e.message,
    }))
    return res.status(400).json({ error: 'Validation failed', errors })
  }
  req.body = result.data
  return next()
}

module.exports = { validate, schemas, z }
