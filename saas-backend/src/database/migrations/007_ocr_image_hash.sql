-- Migration 007: hash SHA-256 para deduplicação de OCR de notas fiscais
ALTER TABLE pending_receipts ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_receipts_hash
  ON pending_receipts(tenant_id, image_hash)
  WHERE image_hash IS NOT NULL;
