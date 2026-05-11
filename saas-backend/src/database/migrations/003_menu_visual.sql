-- Migration 003: campos visuais para menu e produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS cover_url   VARCHAR(500);
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS description TEXT;
