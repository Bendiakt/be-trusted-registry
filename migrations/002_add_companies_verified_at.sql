-- Migration 002: Add verified_at timestamp to companies
-- Safe: additive column, IF NOT EXISTS guard, no table lock
-- Apply: see MIGRATION_STRATEGY.md for procedure
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
