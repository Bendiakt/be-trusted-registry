'use strict'
/**
 * lib/authUtils.js — backward-compat re-export shim.
 * All logic lives in lib/auth.js. This shim lets existing route files
 * keep their import paths without modification.
 * New code should import directly from '../lib/auth'.
 */
module.exports = require('./auth')
