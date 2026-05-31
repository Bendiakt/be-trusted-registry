'use strict'
/**
 * migrations.test.js — unit tests for the migration safety linter
 * (scripts/check-migrations.js) + a guard that every real migration passes.
 *
 * Usage: node --test tests/migrations.test.js
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { lintMigration, lintDirectory } = require('../scripts/check-migrations')

describe('lintMigration — destructive statements', () => {
  test('flags DROP TABLE', () => {
    const { errors } = lintMigration('020_x.sql', 'DROP TABLE users;')
    assert.ok(errors.some((e) => /DROP TABLE/.test(e)))
  })

  test('flags TRUNCATE', () => {
    const { errors } = lintMigration('020_x.sql', 'TRUNCATE audit_log;')
    assert.ok(errors.some((e) => /TRUNCATE/.test(e)))
  })

  test('flags ALTER TABLE … DROP COLUMN', () => {
    const { errors } = lintMigration('020_x.sql', 'ALTER TABLE users DROP COLUMN email;')
    assert.ok(errors.some((e) => /DROP COLUMN/.test(e)))
  })

  test('flags unbounded DELETE FROM', () => {
    const { errors } = lintMigration('020_x.sql', 'DELETE FROM notifications;')
    assert.ok(errors.some((e) => /Unbounded/.test(e)))
  })

  test('allows DELETE with a WHERE clause', () => {
    const { errors } = lintMigration('020_x.sql', "DELETE FROM notifications WHERE created_at < NOW();")
    assert.equal(errors.length, 0)
  })

  test('@destructive-ok annotation suppresses the error', () => {
    const sql = '-- @destructive-ok: dropping deprecated table after 2-step deprecation\nDROP TABLE legacy;'
    const { errors } = lintMigration('020_x.sql', sql)
    assert.equal(errors.length, 0)
  })

  test('ignores destructive keywords that appear only in comments', () => {
    const sql = '-- this migration does NOT DROP TABLE anything\nCREATE TABLE IF NOT EXISTS x (id int);'
    const { errors } = lintMigration('020_x.sql', sql)
    assert.equal(errors.length, 0)
  })
})

describe('lintMigration — structural rules', () => {
  test('rejects a bad file name', () => {
    const { errors } = lintMigration('not-a-migration.sql', 'SELECT 1;')
    assert.ok(errors.some((e) => /does not match/.test(e)))
  })

  test('flags explicit BEGIN/COMMIT', () => {
    const { errors } = lintMigration('020_x.sql', 'BEGIN;\nCREATE TABLE IF NOT EXISTS x (id int);\nCOMMIT;')
    assert.ok(errors.some((e) => /BEGIN\/COMMIT/.test(e)))
  })
})

describe('lintMigration — idempotency warnings', () => {
  test('warns on CREATE TABLE without IF NOT EXISTS', () => {
    const { warnings } = lintMigration('020_x.sql', 'CREATE TABLE x (id int);')
    assert.ok(warnings.some((w) => /CREATE TABLE/.test(w)))
  })

  test('no warning with IF NOT EXISTS', () => {
    const { warnings } = lintMigration('020_x.sql', 'CREATE TABLE IF NOT EXISTS x (id int);')
    assert.equal(warnings.length, 0)
  })

  test('warns on bare ADD COLUMN', () => {
    const { warnings } = lintMigration('020_x.sql', 'ALTER TABLE users ADD COLUMN nickname TEXT;')
    assert.ok(warnings.some((w) => /ADD COLUMN/.test(w)))
  })

  test('no warning on ADD COLUMN IF NOT EXISTS', () => {
    const { warnings } = lintMigration('020_x.sql', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT;')
    assert.equal(warnings.length, 0)
  })

  test('no warning on ADD COLUMN guarded by information_schema check', () => {
    const sql = `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='nickname') THEN
          ALTER TABLE users ADD COLUMN nickname TEXT;
        END IF;
      END $$;`
    const { warnings } = lintMigration('020_x.sql', sql)
    assert.equal(warnings.length, 0)
  })
})

describe('real migrations directory', () => {
  test('every committed migration passes with zero errors', () => {
    const dir = path.join(__dirname, '..', 'migrations')
    const { files, results } = lintDirectory(dir)
    assert.ok(files.length > 0, 'expected at least one migration')
    const withErrors = results.filter((r) => r.errors.length > 0)
    assert.equal(withErrors.length, 0,
      'migrations with errors: ' + JSON.stringify(withErrors, null, 2))
  })
})
