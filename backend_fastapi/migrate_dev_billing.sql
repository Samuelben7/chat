-- Migração: Campos de cartao salvo para cobrança automatica de devs
-- Executar: psql -U <user> -d <db> -f migrate_dev_billing.sql

ALTER TABLE dev_usuario
    ADD COLUMN IF NOT EXISTS mp_customer_id       VARCHAR(100),
    ADD COLUMN IF NOT EXISTS mp_card_id           VARCHAR(100),
    ADD COLUMN IF NOT EXISTS mp_card_last4        VARCHAR(4),
    ADD COLUMN IF NOT EXISTS mp_card_method       VARCHAR(30),
    ADD COLUMN IF NOT EXISTS proximo_cobr_numeros TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_dev_usuario_mp_customer ON dev_usuario(mp_customer_id);
