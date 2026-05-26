'use strict'
/**
 * lib/auditActions.js — Typed constants for all audit log action strings.
 *
 * Usage:
 *   const { AUDIT } = require('../lib/auditActions')
 *   logAudit(req.user.id, AUDIT.USER_LOGIN, 'users', req.ip)
 *
 * Benefits:
 *  - Typo-proof: mistyping a constant is a ReferenceError, not a silent bad string.
 *  - Grep-able: all action names are defined in one place.
 *  - IDE auto-complete works across all route files.
 */

const AUDIT = Object.freeze({
  // ── Authentication ────────────────────────────────────────────────────────
  USER_REGISTER:          'user_register',
  USER_LOGIN:             'user_login',
  LOGIN_FAILED:           'login_failed',
  LOGIN_BLOCKED_LOCKOUT:  'login_blocked_lockout',
  LOGIN_2FA_REQUIRED:     'login_2fa_required',
  LOGIN_2FA_SUCCESS:      'login_2fa_success',
  EMAIL_VERIFIED:         'email_verified',
  RESEND_VERIFY_PUBLIC:   'resend_verify_public',
  PASSWORD_RESET:         'password_reset',
  PROFILE_UPDATE:         'profile_update',

  // ── TOTP / 2FA ────────────────────────────────────────────────────────────
  TOTP_ENABLED:           'totp_enabled',
  TOTP_DISABLED:          'totp_disabled',
  TOTP_VERIFY_FAIL:       'totp_verify_fail',
  TOTP_VALIDATE_FAIL:     'totp_validate_fail',
  TOTP_DISABLE_BAD_PASSWORD: 'totp_disable_bad_password',
  TOTP_DISABLE_BAD_CODE:  'totp_disable_bad_code',

  // ── Company ───────────────────────────────────────────────────────────────
  COMPANY_PROFILE_UPDATE: 'company_profile_update',

  // ── PAC ───────────────────────────────────────────────────────────────────
  PAC_PROFILE_UPDATE:     'pac_profile_update',
  MISSION_ACCEPTED:       'mission_accepted',
  MISSION_COMPLETED:      'mission_completed',
  PAC_FOUNDER_GRANTED:    'pac_founder_granted',
  PAC_UPGRADE_APPROVED:   'pac_upgrade_approved',
  PAC_LICENSE_SUSPENDED:  'pac_license_suspended',
  PAC_LICENSE_REINSTATED: 'pac_license_reinstated',

  // ── Admin ─────────────────────────────────────────────────────────────────
  ADMIN_CHANGE_USER_ROLE:       'admin_change_user_role',
  ADMIN_DELETE_USER:            'admin_delete_user',
  ADMIN_SET_CERT_LEVEL:         'admin_set_cert_level',
  ADMIN_SUSPEND_COMPANY:        'admin_suspend_company',
  ADMIN_UNSUSPEND_COMPANY:      'admin_unsuspend_company',
  ADMIN_MISSION_STATUS_UPDATE:  'admin_mission_status_update',
  ADMIN_RESOLVE_FRAUD_ALERT:    'admin_resolve_fraud_alert',

  // ── GDPR ──────────────────────────────────────────────────────────────────
  USER_DATA_EXPORT:       'user_data_export',
  USER_ACCOUNT_DELETED:   'user_account_deleted',

  // ── Trader watchlist ──────────────────────────────────────────────────────
  WATCHLIST_ADD:          'watchlist_add',
  WATCHLIST_REMOVE:       'watchlist_remove',

  // ── API Keys ──────────────────────────────────────────────────────────────
  API_KEY_CREATED:              'api_key_created',
  API_KEY_REVOKED:              'api_key_revoked',

  // ── Webhooks ──────────────────────────────────────────────────────────────
  WEBHOOK_CREATED:              'webhook_created',
  WEBHOOK_DELETED:              'webhook_deleted',

  // ── Logout / session ──────────────────────────────────────────────────────
  USER_LOGOUT:                  'user_logout',
  PASSWORD_RESET_REQUEST:       'password_reset_request',
})

module.exports = { AUDIT }
