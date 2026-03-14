-- ============================================================
-- Migration: Planos Personalizados + Dias Gratuitos
-- ============================================================

-- 1. Campos de plano personalizado na assinatura
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS is_personalizado BOOLEAN DEFAULT FALSE;
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS plano_personalizado_nome VARCHAR(100);
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS preco_personalizado NUMERIC(10,2);
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS limites_personalizados JSONB;
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS dias_gratuitos INTEGER DEFAULT 0;
ALTER TABLE assinatura ADD COLUMN IF NOT EXISTS trial_expira_em TIMESTAMPTZ;
