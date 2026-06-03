-- Migration 005: limite diário de sangria por tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sangria_daily_limit NUMERIC DEFAULT NULL;
