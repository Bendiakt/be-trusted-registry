-- Migration 001: Add last_login timestamp to users
-- Safe: additive column, IF NOT EXISTS guard, no table lock
-- Apply: see MIGRATION_STRATEGY.md for procedure
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
