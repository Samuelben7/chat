-- Migration: CRM Auto-Archive para Kanban
-- Executar via: docker exec -i whatsapp_db psql -U postgres -d whatsapp_db < /tmp/migrate_crm_arquivo.sql

ALTER TABLE whatsapp_bot_cliente ADD COLUMN IF NOT EXISTS crm_arquivado BOOLEAN DEFAULT FALSE;
ALTER TABLE whatsapp_bot_cliente ADD COLUMN IF NOT EXISTS crm_arquivado_em TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_arquivado ON whatsapp_bot_cliente (empresa_id, crm_arquivado);
