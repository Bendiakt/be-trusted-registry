-- 000_baseline.sql
-- Baseline schema — core tables required before all other migrations.
-- Safe to run on existing databases (CREATE TABLE IF NOT EXISTS throughout).
--
-- This migration exists so that `npm run migrate` works on a completely fresh
-- database (e.g. staging) without requiring `initDb()` / server startup first.
-- All migrations 001+ reference users(id) or companies(id) via FK constraints —
-- those FKs fail on a blank DB unless these tables are created first.
--
-- Production impact: zero — all statements are idempotent (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL      PRIMARY KEY,
  name                  TEXT        NOT NULL,
  email                 TEXT        NOT NULL UNIQUE,
  password              TEXT        NOT NULL,
  role                  TEXT        NOT NULL DEFAULT 'trader',
  email_verified        BOOLEAN     NOT NULL DEFAULT FALSE,
  email_verify_token    TEXT,
  email_verify_expires  TIMESTAMPTZ,
  tos_version           TEXT,
  tos_accepted_at       TIMESTAMPTZ,
  gdpr_erasure_requested_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id                    SERIAL      PRIMARY KEY,
  user_id               INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT        NOT NULL,
  sector                TEXT,
  country               TEXT,
  description           TEXT,
  website               TEXT,
  phone                 TEXT,
  address               TEXT,
  employee_count        INTEGER,
  annual_revenue        TEXT,
  certification_level   INTEGER     NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'pending',
  trust_score           INTEGER     NOT NULL DEFAULT 0,
  badge                 TEXT,
  stripe_customer_id    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS missions (
  id          SERIAL      PRIMARY KEY,
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'open',
  assigned_to INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  company_id  INTEGER     REFERENCES companies(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pac_profiles (
  id           SERIAL      PRIMARY KEY,
  user_id      INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio          TEXT,
  expertise    TEXT,
  languages    TEXT,
  availability TEXT,
  certifications TEXT,
  rating       NUMERIC(3,2) DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
