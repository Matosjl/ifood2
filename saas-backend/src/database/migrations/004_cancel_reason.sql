-- Migration 004: motivo obrigatório de cancelamento em pedidos
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
