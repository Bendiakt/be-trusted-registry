'use strict'

/**
 * blocklist.js — Companies that cannot be CERTIFIED on this platform.
 *
 * B&E CONSULT (in all legal forms) is the platform operator.
 * These entities CAN register and appear in the public registry,
 * but CANNOT request or receive certification (conflict of interest).
 */

// Canonical blocked names — checked case-insensitively after normalization
const BLOCKED_PATTERNS = [
  // Core name variants
  /b\s*[&e]\s*e?\s*consult/i,
  /b\s+and\s+e\s+consult/i,
  /b-e\s*consult/i,
  /be\s*consult/i,
]

// Legal suffixes that don't change the match (stripped before checking)
const LEGAL_SUFFIXES = /\s*(fzco|sarl|pty|ltd|llc|inc|sas|srl|bv|gmbh|ag|sa|spa|nv)\b.*/i

/**
 * Normalize a company name for comparison:
 *  - lowercase
 *  - strip common legal suffixes
 *  - collapse whitespace
 */
function normalize (name) {
  return String(name || '')
    .trim()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Returns true if the company name is on the operator blocklist.
 * @param {string} companyName
 * @returns {boolean}
 */
function isBlockedCompany (companyName) {
  if (!companyName) return false
  const normalized = normalize(companyName)
  return BLOCKED_PATTERNS.some(pattern => pattern.test(normalized))
}

/**
 * Express middleware — rejects CERTIFICATION requests for blocked company names.
 * Use only on certification/payment routes, NOT on registration routes.
 * Checks `name`, `companyName`, and `company_name` fields.
 * @param {string} [errorMsg]
 */
function blocklistedCompanyMiddleware (errorMsg) {
  const msg = errorMsg || 'This company cannot be certified on this platform.'
  return (req, res, next) => {
    const candidate =
      req.body?.name ||
      req.body?.companyName ||
      req.body?.company_name ||
      ''
    if (isBlockedCompany(candidate)) {
      return res.status(403).json({ error: msg })
    }
    next()
  }
}

module.exports = { isBlockedCompany, blocklistedCompanyMiddleware, normalize }
