-- Migration 002: Add trial date columns to tenants
-- Run once on existing database:
--   psql -d saas_restaurant -f src/database/migrations/002_add_trial_columns.sql

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_trial_ends_at  TIMESTAMPTZ;
