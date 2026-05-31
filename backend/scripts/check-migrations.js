#!/usr/bin/env node
'use strict'
/**
 * check-migrations.js — migration safety linter.
 *
 * The migrator (`scripts/migrate.js`) is FORWARD-ONLY: there are no
 * down-migrations, and each file is applied once inside a transaction.
 * That makes a careless destructive statement (DROP/TRUNCATE/unbounded
 * DELETE) very expensive to undo — it needs a point-in-time DB restore.
 *
 * This linter enforces, at CI time:
 *   - ERROR  : destructive statements, unless the file is explicitly annotated
 *              with `-- @destructive-ok: <reason>` (deliberate + reviewed).
 *   - ERROR  : file name not matching the migrator's `NNN_name.sql` pattern.
 *   - ERROR  : explicit BEGIN/COMMIT (migrate.js already wraps each file in a
 *              transaction — a nested COMMIT would split it).
 *   - WARNING : non-idempotent DDL (CREATE TABLE/INDEX without IF NOT EXISTS,
 *               ADD COLUMN without IF NOT EXISTS) — re-runs should be safe.
 *
 * Usage:
 *   node scripts/check-migrations.js            # lint backend/migrations
 *   node scripts/check-migrations.js --strict   # treat warnings as errors
 *
 * Exit codes: 0 = clean (warnings allowed unless --strict), 1 = errors found.
 */
const fs = require('fs')
const path = require('path')

const MIGRATION_FILE_RE = /^\d+_.+\.sql$/

/** Remove `--` line comments and block comments so we never match on prose. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/--[^\n]*/g, ' ')           // line comments
}

const DESTRUCTIVE = [
  { re: /\bDROP\s+TABLE\b/i,                 label: 'DROP TABLE' },
  { re: /\bDROP\s+SCHEMA\b/i,                label: 'DROP SCHEMA' },
  { re: /\bDROP\s+DATABASE\b/i,              label: 'DROP DATABASE' },
  { re: /\bTRUNCATE\b/i,                     label: 'TRUNCATE' },
  { re: /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i, label: 'ALTER TABLE … DROP COLUMN' },
  { re: /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+CONSTRAINT\b/i, label: 'ALTER TABLE … DROP CONSTRAINT' },
]

/** DELETE FROM <t> with no WHERE = full-table wipe. */
function findUnboundedDelete(sql) {
  const re = /\bDELETE\s+FROM\s+[a-zA-Z0-9_."]+\s*(;|$)/gim
  return re.test(sql)
}

/**
 * Lint a single migration. Pure — no FS/DB. Returns { errors, warnings }.
 */
function lintMigration(fileName, rawSql) {
  const errors = []
  const warnings = []

  if (!MIGRATION_FILE_RE.test(fileName)) {
    errors.push(`File name "${fileName}" does not match the migrator pattern NNN_name.sql`)
  }

  const sql = stripComments(rawSql)
  const annotatedOk = /@destructive-ok\b/i.test(rawSql) // annotation read from raw (it's a comment)

  for (const { re, label } of DESTRUCTIVE) {
    if (re.test(sql) && !annotatedOk) {
      errors.push(`Destructive statement "${label}" — forward-only migrations can't undo this. Add "-- @destructive-ok: <reason>" if intentional.`)
    }
  }
  if (findUnboundedDelete(sql) && !annotatedOk) {
    errors.push('Unbounded "DELETE FROM <table>" (no WHERE) wipes the table. Add a WHERE clause or "-- @destructive-ok: <reason>".')
  }

  // migrate.js wraps each file in BEGIN/COMMIT already.
  if (/\bBEGIN\b\s*;/i.test(sql) || /\bCOMMIT\b\s*;/i.test(sql)) {
    errors.push('Explicit BEGIN/COMMIT found — the migrator already wraps each file in a transaction.')
  }

  // Idempotency (warnings)
  if (/\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(sql)) {
    warnings.push('CREATE TABLE without "IF NOT EXISTS" — re-runs may fail.')
  }
  if (/\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY\s+IF\s+NOT\s+EXISTS)/i.test(sql)) {
    warnings.push('CREATE INDEX without "IF NOT EXISTS" — re-runs may fail.')
  }
  // ADD COLUMN is idempotent if it uses "IF NOT EXISTS" OR is wrapped in a
  // `DO $$ … IF NOT EXISTS (information_schema.columns … column_name='X') …` guard.
  const addColRe = /\bADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/gi
  let m
  while ((m = addColRe.exec(sql)) !== null) {
    if (m[1]) continue // explicit IF NOT EXISTS
    const col = m[2]
    const guard = new RegExp(`information_schema\\.columns[\\s\\S]{0,200}?column_name\\s*=\\s*'${col}'`, 'i')
    if (!guard.test(rawSql)) {
      warnings.push(`ADD COLUMN "${col}" without "IF NOT EXISTS" and no information_schema guard — re-runs may fail.`)
    }
  }

  return { errors, warnings }
}

/** Lint every numbered migration in a directory. Returns aggregate report. */
function lintDirectory(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && MIGRATION_FILE_RE.test(f)).sort()
  const results = files.map((f) => ({ file: f, ...lintMigration(f, fs.readFileSync(path.join(dir, f), 'utf8')) }))

  // Duplicate version-prefix detection (e.g. two 018_*.sql).
  const seen = new Map()
  for (const f of files) {
    const prefix = f.match(/^(\d+)_/)[1]
    if (seen.has(prefix)) {
      results.push({ file: f, errors: [`Duplicate migration version prefix "${prefix}" (also: ${seen.get(prefix)})`], warnings: [] })
    } else {
      seen.set(prefix, f)
    }
  }
  return { files, results }
}

module.exports = { lintMigration, lintDirectory, stripComments, MIGRATION_FILE_RE }

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const strict = process.argv.includes('--strict')
  const dir = path.join(__dirname, '..', 'migrations')
  const { files, results } = lintDirectory(dir)

  let errorCount = 0
  let warnCount = 0

  console.log(`\nMigration safety check — ${files.length} migration(s) in ${path.relative(process.cwd(), dir)}\n`)
  for (const r of results) {
    for (const e of r.errors)   { console.log(`  ❌ [${r.file}] ${e}`); errorCount++ }
    for (const w of r.warnings) { console.log(`  ⚠️  [${r.file}] ${w}`); warnCount++ }
  }
  if (errorCount === 0 && warnCount === 0) console.log('  ✅ All migrations pass safety checks.')

  console.log(`\n  errors: ${errorCount} · warnings: ${warnCount}\n`)

  if (errorCount > 0 || (strict && warnCount > 0)) process.exit(1)
  process.exit(0)
}
