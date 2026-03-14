-- Migração: Suporte multi-numero para devs (dev_numero)
-- Executar: psql -U <user> -d <db> -f migrate_dev_numeros.sql

CREATE TABLE IF NOT EXISTS dev_numero (
    id                      SERIAL PRIMARY KEY,
    dev_id                  INTEGER NOT NULL REFERENCES dev_usuario(id) ON DELETE CASCADE,
    phone_number_id         VARCHAR(50) UNIQUE NOT NULL,
    waba_id                 VARCHAR(50) NOT NULL,
    whatsapp_token          TEXT NOT NULL,
    display_phone_number    VARCHAR(30),
    verified_name           VARCHAR(255),

    -- Billing Mercado Pago
    mp_preapproval_id       VARCHAR(100),
    mp_subscription_status  VARCHAR(30),
    mp_init_point           TEXT,

    -- Status
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    primeiro_uso_em         TIMESTAMPTZ,
    ativo                   BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_dev_numero_dev_id         ON dev_numero(dev_id);
CREATE INDEX IF NOT EXISTS ix_dev_numero_phone_number_id ON dev_numero(phone_number_id);
CREATE INDEX IF NOT EXISTS ix_dev_numero_mp_preapproval  ON dev_numero(mp_preapproval_id);

-- Migrar numeros existentes do campo legado dev_usuario para dev_numero
INSERT INTO dev_numero (dev_id, phone_number_id, waba_id, whatsapp_token, status, ativo)
SELECT
    id,
    phone_number_id,
    COALESCE(waba_id, ''),
    COALESCE(whatsapp_token, ''),
    'active',
    TRUE
FROM dev_usuario
WHERE phone_number_id IS NOT NULL
  AND whatsapp_token IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM dev_numero dn WHERE dn.phone_number_id = dev_usuario.phone_number_id
  );
